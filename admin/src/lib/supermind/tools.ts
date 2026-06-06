// Supermind-verktyg över portalens data. Alla körs med den inloggade medlemmens
// Supabase-klient, så RLS gäller — AI:n ser/ändrar bara det medlemmen får.
// LÄS-verktyg är alltid på. SKRIV-verktyg (endast uppgifter) aktiveras via
// kill switch:en company_settings.ai_enabled. Känsligare data (offerter, kunder,
// ekonomi) förblir läsläge.
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

// Statisk lista (stabil ordning) så att prompt-cachen håller — ändra inte
// ordningen lättvindigt.
export const READ_TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description:
      "Lista projekt med status, prioritet, kund, datum och hur många uppgifter som är klara. Filtrera valfritt på status.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Valfritt statusfilter: planning | in_progress | paused | idea | backlog | done | canceled",
        },
      },
    },
  },
  {
    name: "get_project",
    description:
      "Hämta ett projekt i detalj: status, kund, kontakt, summering, alla uppgifter (med tidsuppskattning) och kopplat GitHub-repo.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string", description: "Projektets UUID" } },
      required: ["project_id"],
    },
  },
  {
    name: "list_tasks",
    description:
      "Lista uppgifter med status, prioritet, deadline, tidsuppskattning och vilka som är tilldelade. Filtrera valfritt på status, projekt eller person.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "not_started | in_progress | done | archived" },
        project_id: { type: "string" },
        assignee_id: { type: "string" },
      },
    },
  },
  {
    name: "list_customers",
    description:
      "Lista kunder och deras stadium (prospect | active | inactive | closed). Använd för att hitta prospekt och kunder som riskerar att svalna.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } },
    },
  },
  {
    name: "list_offers",
    description:
      "Lista offerter med nummer, status (utkast/skickad/accepterad/avslagen/utgången), kund samt engångs- och månadspris. Centralt för intäktsfokus.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_finance_summary",
    description:
      "Sammanfatta ekonomin: summa intäkter, kostnader, samt obetalda/förfallna fakturor. Belopp i SEK.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_meetings",
    description:
      "Lista kommande och nyligen genomförda möten med datum, typ, kund och projekt.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_team",
    description:
      "Hämta teamet: varje medlems roll, expertis/passande uppgifter och veckokapacitet (timmar). Använd för att föreslå VEM som ska göra VAD och för att planera utifrån tillgänglig tid.",
    input_schema: { type: "object", properties: {} },
  },
];

// SKRIV-verktyg — endast uppgifter, och bara när ai_enabled är på. Inga hårda
// raderingar: "ta bort" = arkivera (status archived), vilket är återställbart.
export const WRITE_TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "create_task",
    description:
      "Skapa en ny uppgift. Ange minst en titel. Använd id:n från andra verktyg (get_team för assignee_ids, list_projects för project_id). Skapa bara uppgifter användaren faktiskt bett om.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Vad ska göras (obligatoriskt)" },
        description: { type: "string" },
        project_id: { type: "string", description: "UUID för kopplat projekt" },
        assignee_ids: {
          type: "array",
          items: { type: "string" },
          description: "Profil-UUID:n (från get_team) för de som tilldelas",
        },
        priority: { type: "string", description: "low | medium | high" },
        status: { type: "string", description: "not_started | in_progress | done" },
        due_at: { type: "string", description: "Deadline, ISO-datum (YYYY-MM-DD)" },
        estimate_hours: { type: "number", description: "Uppskattad tid i timmar" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Uppdatera en befintlig uppgift. Ange task_id och bara de fält som ska ändras. Tilldelning (assignee_ids) ERSÄTTER hela listan.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Uppgiftens UUID (obligatoriskt)" },
        title: { type: "string" },
        description: { type: "string" },
        project_id: { type: "string" },
        assignee_ids: { type: "array", items: { type: "string" } },
        priority: { type: "string", description: "low | medium | high" },
        status: { type: "string", description: "not_started | in_progress | done" },
        due_at: { type: "string", description: "ISO-datum, eller tom sträng för att rensa" },
        estimate_hours: { type: "number" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "archive_task",
    description:
      "Arkivera en uppgift (status = archived). Använd i stället för radering — det är återställbart. Ange task_id.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
];

// Nivå per verktyg för revisionsloggen. Grön = ofarlig auto; gul = återställbar
// men mer ingripande (arkivering). Allt loggas till ai_actions.
const YELLOW_TOOLS = new Set(["archive_task"]);
export function toolTier(name: string): "green" | "yellow" {
  return YELLOW_TOOLS.has(name) ? "yellow" : "green";
}

type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

// Dispatch + exekvering. Returnerar alltid ett serialiserbart objekt; kastar
// aldrig (fel paketeras så att Claude kan resonera kring dem). userId används
// som created_by för nya uppgifter.
export async function runTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_projects":
        return await listProjects(supabase, input.status as string | undefined);
      case "get_project":
        return await getProject(supabase, input.project_id as string);
      case "list_tasks":
        return await listTasks(supabase, input);
      case "list_customers":
        return await listCustomers(supabase, input.status as string | undefined);
      case "list_offers":
        return await listOffers(supabase);
      case "get_finance_summary":
        return await financeSummary(supabase);
      case "list_meetings":
        return await listMeetings(supabase);
      case "get_team":
        return await getTeam(supabase);
      case "create_task":
        return await createTask(supabase, userId, input);
      case "update_task":
        return await updateTask(supabase, input);
      case "archive_task":
        return await archiveTask(supabase, input.task_id as string);
      default:
        return { ok: false, error: `Okänt verktyg: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function listProjects(supabase: SupabaseClient, status?: string): Promise<ToolResult> {
  let q = supabase
    .from("projects")
    .select(
      "id,name,status,priority,start_date,end_date,github_owner,github_repo,customer:customers(name,status)",
    )
    .order("priority", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  // Bifoga uppgiftsräkning per projekt (klara / totalt) för progress-signal.
  const ids = (data ?? []).map((p: any) => p.id);
  const counts = new Map<string, { total: number; done: number }>();
  if (ids.length) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("project_id,status")
      .in("project_id", ids);
    for (const t of tasks ?? []) {
      const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
      c.total += 1;
      if (t.status === "done") c.done += 1;
      counts.set(t.project_id, c);
    }
  }
  return {
    ok: true,
    data: (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      start_date: p.start_date,
      end_date: p.end_date,
      customer: p.customer?.name ?? null,
      customer_status: p.customer?.status ?? null,
      github: p.github_owner && p.github_repo ? `${p.github_owner}/${p.github_repo}` : null,
      tasks_done: counts.get(p.id)?.done ?? 0,
      tasks_total: counts.get(p.id)?.total ?? 0,
    })),
  };
}

async function getProject(supabase: SupabaseClient, projectId: string): Promise<ToolResult> {
  if (!projectId) return { ok: false, error: "project_id krävs" };
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id,name,status,priority,summary,start_date,end_date,github_owner,github_repo,contact_name,contact_email,contact_phone,customer:customers(name,status,email,phone)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!project) return { ok: false, error: "Projektet hittades inte" };

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,status,priority,due_at,estimate_hours,assignee_ids")
    .eq("project_id", projectId)
    .order("due_at", { ascending: true, nullsFirst: false });

  const p = project as any;
  return {
    ok: true,
    data: {
      id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      summary: p.summary,
      start_date: p.start_date,
      end_date: p.end_date,
      github: p.github_owner && p.github_repo ? `${p.github_owner}/${p.github_repo}` : null,
      contact: { name: p.contact_name, email: p.contact_email, phone: p.contact_phone },
      customer: p.customer ?? null,
      tasks: (tasks ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_at: t.due_at,
        estimate_hours: t.estimate_hours,
        assignee_count: (t.assignee_ids ?? []).length,
      })),
    },
  };
}

async function listTasks(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  let q = supabase
    .from("tasks")
    .select(
      "id,title,status,priority,due_at,estimate_hours,assignee_ids,project:projects(id,name)",
    )
    .order("due_at", { ascending: true, nullsFirst: false });
  if (input.status) q = q.eq("status", input.status as string);
  if (input.project_id) q = q.eq("project_id", input.project_id as string);
  if (input.assignee_id) q = q.contains("assignee_ids", [input.assignee_id as string]);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_at: t.due_at,
      estimate_hours: t.estimate_hours,
      project: t.project?.name ?? null,
      assignee_count: (t.assignee_ids ?? []).length,
    })),
  };
}

async function listCustomers(supabase: SupabaseClient, status?: string): Promise<ToolResult> {
  let q = supabase
    .from("customers")
    .select("id,name,status,industry,contact_person,email,phone,updated_at")
    .order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

async function listOffers(supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("offers")
    .select(
      "id,offer_number,status,project_price,monthly_price,customer:customers(name),created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((o: any) => ({
      id: o.id,
      offer_number: o.offer_number,
      status: o.status,
      project_price: o.project_price,
      monthly_price: o.monthly_price,
      customer: o.customer?.name ?? null,
      created_at: o.created_at,
    })),
  };
}

async function financeSummary(supabase: SupabaseClient): Promise<ToolResult> {
  const [incomeRes, expenseRes, invoiceRes] = await Promise.all([
    supabase.from("income").select("amount_sek,status"),
    supabase.from("expenses").select("amount_sek,status"),
    supabase.from("invoices").select("amount_sek,status"),
  ]);
  const sum = (rows: any[] | null, pred?: (r: any) => boolean) =>
    (rows ?? [])
      .filter((r) => (pred ? pred(r) : true))
      .reduce((acc, r) => acc + Number(r.amount_sek || 0), 0);

  return {
    ok: true,
    data: {
      income_total_sek: sum(incomeRes.data),
      income_received_sek: sum(incomeRes.data, (r) => r.status === "received"),
      income_pending_sek: sum(incomeRes.data, (r) => r.status === "pending"),
      expense_total_sek: sum(expenseRes.data),
      invoices_unpaid_sek: sum(invoiceRes.data, (r) => r.status === "sent" || r.status === "overdue"),
      invoices_overdue_sek: sum(invoiceRes.data, (r) => r.status === "overdue"),
    },
  };
}

async function listMeetings(supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id,name,date_time,type,status,customer:customers(name),project:projects(name)")
    .order("date_time", { ascending: false })
    .limit(30);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
      date_time: m.date_time,
      type: m.type,
      status: m.status,
      customer: m.customer?.name ?? null,
      project: m.project?.name ?? null,
    })),
  };
}

async function getTeam(supabase: SupabaseClient): Promise<ToolResult> {
  const [profilesRes, capRes] = await Promise.all([
    supabase.from("profiles").select("id,display_name,email"),
    supabase.from("member_capacity").select("profile_id,weekly_hours,role,skills"),
  ]);
  const capById = new Map<string, any>(
    (capRes.data ?? []).map((c: any) => [c.profile_id, c]),
  );
  return {
    ok: true,
    data: (profilesRes.data ?? []).map((p: any) => {
      const c = capById.get(p.id);
      return {
        id: p.id,
        name: p.display_name ?? p.email,
        role: c?.role ?? null,
        skills: c?.skills ?? null,
        weekly_hours: Number(c?.weekly_hours) || 0,
      };
    }),
  };
}

// ---- SKRIV-verktyg (uppgifter) -------------------------------------------

const VALID_STATUS = new Set(["not_started", "in_progress", "done", "archived"]);
const VALID_PRIORITY = new Set(["low", "medium", "high"]);

// Tolka ett datum till ISO-timestamp. Tom sträng → null (rensa). Ogiltigt → undefined.
function toIso(v: unknown): string | null | undefined {
  if (v === "" || v === null) return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function createTask(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { ok: false, error: "title krävs" };

  const status = VALID_STATUS.has(input.status as string)
    ? (input.status as string)
    : "not_started";
  const priority = VALID_PRIORITY.has(input.priority as string)
    ? (input.priority as string)
    : "medium";
  const due = toIso(input.due_at);

  const payload: Record<string, unknown> = {
    title,
    description: typeof input.description === "string" ? input.description.trim() || null : null,
    status,
    priority,
    assignee_ids: Array.isArray(input.assignee_ids) ? input.assignee_ids : [],
    project_id: (input.project_id as string) || null,
    estimate_hours: input.estimate_hours != null ? Number(input.estimate_hours) : null,
    due_at: due === undefined ? null : due,
    completed_at: status === "done" ? new Date().toISOString() : null,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from("tasks")
    .insert(payload)
    .select("id,title,status")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { created: data } };
}

async function updateTask(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const taskId = input.task_id as string;
  if (!taskId) return { ok: false, error: "task_id krävs" };

  // Bygg patch endast av angivna fält.
  const patch: Record<string, unknown> = {};
  if (typeof input.title === "string") patch.title = input.title.trim();
  if (typeof input.description === "string") patch.description = input.description.trim() || null;
  if (input.status !== undefined) {
    if (!VALID_STATUS.has(input.status as string))
      return { ok: false, error: `Ogiltig status: ${input.status}` };
    patch.status = input.status;
    patch.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if (input.priority !== undefined) {
    if (!VALID_PRIORITY.has(input.priority as string))
      return { ok: false, error: `Ogiltig prioritet: ${input.priority}` };
    patch.priority = input.priority;
  }
  if (input.project_id !== undefined) patch.project_id = (input.project_id as string) || null;
  if (Array.isArray(input.assignee_ids)) patch.assignee_ids = input.assignee_ids;
  if (input.estimate_hours !== undefined)
    patch.estimate_hours = input.estimate_hours === null ? null : Number(input.estimate_hours);
  if (input.due_at !== undefined) {
    const due = toIso(input.due_at);
    if (due === undefined) return { ok: false, error: "Ogiltigt due_at-datum" };
    patch.due_at = due;
  }

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "Inga fält att uppdatera angavs" };

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id,title,status")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Uppgiften hittades inte" };
  return { ok: true, data: { updated: data, changed: Object.keys(patch) } };
}

async function archiveTask(supabase: SupabaseClient, taskId: string): Promise<ToolResult> {
  if (!taskId) return { ok: false, error: "task_id krävs" };
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "archived" })
    .eq("id", taskId)
    .select("id,title")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Uppgiften hittades inte" };
  return { ok: true, data: { archived: data } };
}

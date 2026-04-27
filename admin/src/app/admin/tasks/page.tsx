import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SortSelect } from "@/components/SortSelect";
import { NewTaskButton } from "./NewTaskButton";
import { TaskCard, type Task } from "./TaskCard";

export const dynamic = "force-dynamic";

const COLUMNS: { key: "not_started" | "in_progress" | "done"; label: string; hint: string; accent: string }[] = [
  { key: "not_started", label: "Att göra", hint: "Ej påbörjat", accent: "bg-white/30" },
  { key: "in_progress", label: "Pågår", hint: "Aktivt arbete", accent: "bg-amber-400" },
  { key: "done", label: "Klart", hint: "Avslutat", accent: "bg-[var(--triad-teal)]" },
];

const SORTS = [
  { value: "due_asc", label: "Deadline (närmast)" },
  { value: "due_desc", label: "Deadline (senast)" },
  { value: "priority", label: "Prioritet" },
  { value: "created_desc", label: "Nyast" },
  { value: "created_asc", label: "Äldst" },
  { value: "title", label: "Titel (A–Ö)" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "due_asc";
  const supabase = await createClient();

  let q = supabase
    .from("tasks")
    .select(
      "id,title,description,status,priority,start_at,due_at,created_at,assignee_ids,project:projects(id,name)",
    );

  if (sort === "due_desc") q = q.order("due_at", { ascending: false, nullsFirst: false });
  else if (sort === "priority") q = q.order("priority", { ascending: false }).order("due_at", { ascending: true, nullsFirst: false });
  else if (sort === "created_desc") q = q.order("created_at", { ascending: false });
  else if (sort === "created_asc") q = q.order("created_at", { ascending: true });
  else if (sort === "title") q = q.order("title", { ascending: true });
  else q = q.order("due_at", { ascending: true, nullsFirst: false }).order("priority", { ascending: false });

  const [{ data: tasks }, { data: profilesData }] = await Promise.all([
    q,
    supabase.from("profiles").select("id,display_name"),
  ]);

  const profileById = new Map<string, { id: string; display_name: string | null }>(
    (profilesData ?? []).map((p: any) => [p.id, p]),
  );

  const all = (tasks ?? []).map((t: any) => ({
    ...t,
    assignees: (t.assignee_ids ?? [])
      .map((id: string) => profileById.get(id))
      .filter(Boolean) as Array<{ id: string; display_name: string | null }>,
  })) as unknown as Task[];
  const groups: Record<string, Task[]> = { not_started: [], in_progress: [], done: [] };
  all.forEach((t) => {
    (groups[t.status] ??= []).push(t);
  });

  const total = all.length;
  const doneCount = groups.done?.length ?? 0;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Uppgifter"
        subtitle="Teamets gemensamma att-göra-lista. Klicka checkboxen för att bocka av."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="due_asc" />
            <NewTaskButton />
          </div>
        }
      />

      <div className="mb-6 glass rounded-card p-4">
        <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
          <span>{doneCount} av {total} uppgifter klara</span>
          <span className="font-mono text-white">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--triad-teal)] to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = groups[col.key] ?? [];
          return (
            <section key={col.key} className="glass rounded-card p-4 min-h-[300px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.accent}`} />
                  <h2 className="font-heading text-sm font-semibold uppercase tracking-wider">{col.label}</h2>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {items.length}
                  </span>
                </div>
              </div>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.id}>
                    <TaskCard task={t} />
                  </li>
                ))}
                {!items.length && (
                  <li className="rounded-btn border border-dashed border-white/5 py-8 text-center text-xs text-[var(--muted)]">
                    {col.key === "done" ? "Inget avklarat än." : "Inget här."}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

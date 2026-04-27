import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/Chip";
import { ArrowLeft } from "lucide-react";
import { ProjectInfoEditor } from "./ProjectInfoEditor";
import { ProjectContactEditor } from "./ProjectContactEditor";
import { ProjectFilesManager, type ProjectFile } from "./ProjectFilesManager";
import { ProjectTimeline, type TimelineTask } from "./ProjectTimeline";
import { ProjectTaskList, type ProjectTask } from "./ProjectTaskList";

export const dynamic = "force-dynamic";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, tasksRes, filesRes, profilesRes, customersRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id,name,status,priority,summary,start_date,end_date,owner_id,customer_id,contact_name,contact_email,contact_phone," +
          "owner:profiles(id,display_name,email)," +
          "customer:customers(id,name,contact_person,email,phone,website)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select(
        "id,title,description,status,priority,due_at,created_at,completed_at," +
          "assignee:profiles!tasks_assignee_id_fkey(id,display_name)," +
          "project:projects(id,name)",
      )
      .eq("project_id", id)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .order("uploaded_at", { ascending: false }),
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
    supabase.from("customers").select("id,name").order("name"),
  ]);

  const project = projectRes.data as any;
  if (!project) notFound();

  const tasks = (tasksRes.data ?? []) as unknown as ProjectTask[];
  const files = (filesRes.data ?? []) as ProjectFile[];
  const profiles = (profilesRes.data ?? []) as Array<{
    id: string;
    display_name: string | null;
    email: string | null;
  }>;
  const customers = (customersRes.data ?? []) as Array<{ id: string; name: string }>;

  // Sign all file paths in batch for inline previews/downloads.
  const previews = new Map<string, string>();
  if (files.length > 0) {
    const { data: signed } = await supabase.storage
      .from("project-files")
      .createSignedUrls(
        files.map((f) => f.file_path),
        60 * 30,
      );
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) previews.set(row.path, row.signedUrl);
    }
  }
  const filesWithPreview: ProjectFile[] = files.map((f) => ({
    ...f,
    preview_url: previews.get(f.file_path) ?? null,
  }));

  const timelineTasks: TimelineTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority ?? null,
    start: t.created_at,
    end: t.completed_at ?? t.due_at ?? null,
    due_at: t.due_at,
  }));

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link
          href="/admin/projects"
          className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          Alla projekt
        </Link>
      </div>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Chip tone={statusTone(project.status)}>{statusLabel(project.status)}</Chip>
            {project.priority && (
              <Chip
                tone={
                  project.priority === "high"
                    ? "red"
                    : project.priority === "medium"
                    ? "yellow"
                    : "gray"
                }
              >
                {priorityLabel(project.priority)}
              </Chip>
            )}
            {project.customer?.name && (
              <span className="text-xs text-[var(--muted)]">· {project.customer.name}</span>
            )}
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.summary && (
            <p className="text-sm text-[var(--muted)] mt-2 max-w-3xl leading-relaxed">{project.summary}</p>
          )}
        </div>
      </header>

      <div className="mb-6 glass rounded-card p-4">
        <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
          <span>
            {done} av {total} uppgifter klara · {inProgress} pågår
          </span>
          <span className="font-mono text-white">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--triad-teal)] to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6 min-w-0">
          <Section title="Tidslinje">
            <ProjectTimeline tasks={timelineTasks} startDate={project.start_date} endDate={project.end_date} />
          </Section>

          <Section title={`Uppgifter (${total})`}>
            <ProjectTaskList projectId={project.id} initial={tasks} profiles={profiles} />
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Projektinfo">
            <ProjectInfoEditor
              project={{
                id: project.id,
                status: project.status,
                priority: project.priority,
                start_date: project.start_date,
                end_date: project.end_date,
                owner_id: project.owner_id,
                customer_id: project.customer_id,
                summary: project.summary,
              }}
              owner={project.owner}
              profiles={profiles}
              customers={customers}
            />
          </Section>

          <Section title="Kontakt">
            <ProjectContactEditor
              projectId={project.id}
              customer={project.customer}
              initial={{
                contact_name: project.contact_name,
                contact_email: project.contact_email,
                contact_phone: project.contact_phone,
              }}
            />
          </Section>

          <Section title="Filer">
            <ProjectFilesManager projectId={project.id} initial={filesWithPreview} />
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-card overflow-hidden">
      <header className="px-5 py-3 border-b border-white/5">
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wider text-[var(--muted)]">
          {title}
        </h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function statusTone(s: string | null): any {
  if (!s) return "gray";
  if (s === "done") return "green";
  if (s === "in_progress") return "teal";
  if (s === "planning") return "blue";
  if (s === "canceled") return "red";
  if (s === "paused") return "yellow";
  if (s === "idea") return "purple";
  if (s === "backlog") return "gray";
  return "gray";
}
function statusLabel(s: string | null) {
  return s === "in_progress"
    ? "Pågår"
    : s === "planning"
    ? "Planering"
    : s === "done"
    ? "Klart"
    : s === "canceled"
    ? "Avbrutet"
    : s === "paused"
    ? "Pausat"
    : s === "idea"
    ? "Idé"
    : s === "backlog"
    ? "Backlog"
    : s ?? "—";
}
function priorityLabel(p: string | null) {
  return p === "high" ? "Hög prio" : p === "medium" ? "Medel prio" : p === "low" ? "Låg prio" : p ?? "—";
}

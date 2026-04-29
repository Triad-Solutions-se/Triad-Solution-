import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { CheckCircle2, CheckSquare, FolderKanban, Calendar, Users, ChevronRight } from "lucide-react";
import { DashboardTaskRow } from "./DashboardTaskRow";
import type { Task as TaskCardTask } from "./tasks/TaskCard";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  start_at: string | null;
  due_at: string | null;
  assignee_ids: string[];
  project: { id: string; name: string } | null;
  assignees?: Array<{ id: string; display_name: string | null }>;
};

function toCardTask(t: TaskRow): TaskCardTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    start_at: t.start_at,
    due_at: t.due_at,
    description: t.description,
    project: t.project ?? null,
    assignees: t.assignees ?? [],
  };
}

type MeetingRow = { id: string; name: string; date: string | null; type: string | null };

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const nowIso = new Date().toISOString();

  const taskFields =
    "id,title,description,status,priority,start_at,due_at,assignee_ids,project:projects(id,name)";
  const [tasksOpen, tasksMine, projects, meetings, customers, profilesData] = await Promise.all([
    supabase
      .from("tasks")
      .select(taskFields, { count: "exact" })
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(8),
    user
      ? supabase
          .from("tasks")
          .select(taskFields, { count: "exact" })
          .contains("assignee_ids", [user.id])
          .neq("status", "done")
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(10)
      : Promise.resolve({ data: [], count: 0 } as any),
    supabase.from("projects").select("id,name,status,priority", { count: "exact" }).limit(6),
    supabase
      .from("meetings")
      .select("id,name,date:date_time,type", { count: "exact" })
      .gte("date_time", nowIso)
      .order("date_time", { ascending: true })
      .limit(6),
    supabase.from("customers").select("id,name,status", { count: "exact" }).limit(6),
    supabase.from("profiles").select("id,display_name"),
  ]);

  const profileById = new Map<string, { id: string; display_name: string | null }>(
    ((profilesData.data ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p]),
  );
  const hydrate = (rows: any[]): TaskRow[] =>
    rows.map((t) => ({
      ...t,
      assignees: ((t.assignee_ids ?? []) as string[])
        .map((aid) => profileById.get(aid))
        .filter(Boolean) as Array<{ id: string; display_name: string | null }>,
    }));

  const openTasks = hydrate(tasksOpen.data ?? []);
  const myTasks = hydrate(tasksMine.data ?? []);
  const upcomingMeetings = (meetings.data ?? []) as unknown as MeetingRow[];

  return (
    <>
      <PageHeader title="Översikt" subtitle="Från idé till SaaS-bolag — Triad Solutions internt nav." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
        <StatCard label="Öppna uppgifter" value={tasksOpen.count ?? 0} href="/admin/tasks" icon={CheckSquare} color="teal" />
        <StatCard label="Projekt" value={projects.count ?? 0} href="/admin/projects" icon={FolderKanban} color="purple" />
        <StatCard label="Kommande möten" value={meetings.count ?? 0} href="/admin/meetings" icon={Calendar} color="amber" />
        <StatCard label="Kunder" value={customers.count ?? 0} href="/admin/customers" icon={Users} color="emerald" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="glass rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold">Mina uppgifter</h2>
            <Link href="/admin/tasks" className="text-xs text-[var(--muted)] hover:text-white">
              Alla →
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 size={32} className="text-emerald-400 opacity-80" />
              <div>
                <p className="text-sm font-medium text-white/80">Allt klart!</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">Inga uppgifter tilldelade dig just nu.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {myTasks.map((t) => (
                <li key={t.id}>
                  <DashboardTaskRow
                    task={toCardTask(t)}
                    className="py-2.5 -mx-5 px-5 text-sm hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1 min-w-0 font-medium">{t.title}</span>
                      {t.priority && (
                        <Chip tone={t.priority === "high" ? "red" : t.priority === "medium" ? "yellow" : "gray"}>
                          {t.priority === "high" ? "Hög" : t.priority === "medium" ? "Medel" : "Låg"}
                        </Chip>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-[var(--muted)]">
                      {t.project && (
                        <Link
                          href={`/admin/projects/${t.project.id}`}
                          className="inline-flex items-center gap-1 min-w-0 max-w-[55%] hover:text-white transition-colors"
                        >
                          <FolderKanban size={11} className="opacity-70 shrink-0" />
                          <span className="truncate underline-offset-2 hover:underline">{t.project.name}</span>
                        </Link>
                      )}
                      <Chip tone={statusTone(t.status)}>{t.status}</Chip>
                      {t.due_at && (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            new Date(t.due_at) < new Date() ? "text-rose-300" : ""
                          }`}
                        >
                          <Calendar size={11} className="opacity-70" />
                          {new Date(t.due_at) < new Date() && "⚠ "}
                          {fmtDate(t.due_at)}
                        </span>
                      )}
                    </div>
                  </DashboardTaskRow>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2 glass rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold">Teamets kommande uppgifter</h2>
            <Link href="/admin/tasks" className="text-xs text-[var(--muted)] hover:text-white">
              Kanban →
            </Link>
          </div>
          <ul className="divide-y divide-white/5">
            {openTasks.map((t) => {
              const assignees = t.assignees ?? [];
              return (
                <li key={t.id}>
                  <DashboardTaskRow
                    task={toCardTask(t)}
                    className="py-2.5 flex flex-col gap-1 text-sm group hover:bg-white/[0.03] -mx-5 px-5 transition-colors"
                  >
                    <span className="truncate font-medium">{t.title}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {assignees.length > 0 ? (
                      <span className="inline-flex items-center -space-x-1.5">
                        {assignees.slice(0, 3).map((a, i) => {
                          const name = a.display_name ?? "?";
                          const initials = name
                            .split(" ")
                            .map((w: string) => w[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2);
                          return (
                            <span
                              key={i}
                              title={name}
                              className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center font-semibold shrink-0 ring-2 ring-[var(--surface)]"
                            >
                              {initials}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span
                        title="Ingen tilldelad"
                        className="h-5 w-5 rounded-full bg-white/10 text-[var(--muted)] text-[10px] flex items-center justify-center font-semibold shrink-0"
                      >
                        T
                      </span>
                    )}
                    {t.priority && (
                      <Chip tone={t.priority === "high" ? "red" : t.priority === "medium" ? "yellow" : "gray"}>
                        {t.priority === "high" ? "Hög" : t.priority === "medium" ? "Medel" : "Låg"}
                      </Chip>
                    )}
                    <Chip tone={statusTone(t.status)}>{t.status}</Chip>
                  </div>
                  </DashboardTaskRow>
                </li>
              );
            })}
            {!openTasks.length && (
              <li className="py-6 text-sm text-[var(--muted)]">Inga öppna uppgifter.</li>
            )}
          </ul>
        </section>

        <section className="lg:col-span-3 glass rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold">Kommande möten</h2>
            <Link href="/admin/meetings" className="text-xs text-[var(--muted)] hover:text-white">
              Kalender →
            </Link>
          </div>
          <ul className="space-y-3">
            {upcomingMeetings.map((m) => (
              <li key={m.id} className="text-sm flex items-start gap-3">
                <div className="h-2 w-2 rounded-full bg-[var(--triad-teal)] mt-1.5 shrink-0" />
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {m.date ? fmtDateTime(m.date) : "Ingen tid"} · {m.type ?? "—"}
                  </div>
                </div>
              </li>
            ))}
            {!upcomingMeetings.length && (
              <div className="text-sm text-[var(--muted)]">Inga kommande möten.</div>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}

const colorMap = {
  teal: { accentBar: "bg-teal-400", iconBg: "bg-teal-400/15", iconColor: "text-teal-400" },
  purple: { accentBar: "bg-purple-400", iconBg: "bg-purple-400/15", iconColor: "text-purple-400" },
  amber: { accentBar: "bg-amber-400", iconBg: "bg-amber-400/15", iconColor: "text-amber-400" },
  emerald: { accentBar: "bg-emerald-400", iconBg: "bg-emerald-400/15", iconColor: "text-emerald-400" },
};

function StatCard({
  label, value, href, icon: Icon, color,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ElementType;
  color: keyof typeof colorMap;
}) {
  const c = colorMap[color];
  return (
    <Link
      href={href}
      className="glass rounded-xl border border-white/10 p-5 hover:bg-white/[0.03] transition-colors block relative overflow-hidden"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.accentBar}`} />
      <div className={`absolute top-3 right-3 p-1.5 rounded-lg ${c.iconBg}`}>
        <Icon size={16} className={c.iconColor} />
      </div>
      <div className="text-xs uppercase tracking-wider text-[var(--muted)] pr-10 pl-2">{label}</div>
      <div className="font-heading text-2xl sm:text-3xl font-bold mt-2 pl-2">{value}</div>
    </Link>
  );
}

function statusTone(s: string | null): any {
  if (!s) return "gray";
  if (["done", "completed"].includes(s)) return "green";
  if (["in_progress"].includes(s)) return "teal";
  if (["blocked", "canceled"].includes(s)) return "red";
  return "gray";
}

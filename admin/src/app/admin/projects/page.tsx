import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { SortSelect } from "@/components/SortSelect";
import { NewProjectButton } from "./NewProjectButton";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Prioritet" },
  { value: "name", label: "Namn (A–Ö)" },
  { value: "end_asc", label: "Slutdatum (närmast)" },
  { value: "created_desc", label: "Nyast" },
];

type Project = {
  id: string;
  name: string;
  status: string | null;
  priority: string | null;
  summary: string | null;
  start_date: string | null;
  end_date: string | null;
  owner: { display_name: string | null } | null;
  customer: { name: string } | null;
  tasks: { status: string }[];
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "status";
  const supabase = await createClient();
  let q = supabase
    .from("projects")
    .select(
      "id,name,status,priority,summary,start_date,end_date,created_at,owner:profiles(display_name),customer:customers(name),tasks(status)",
    );
  if (sort === "priority") q = q.order("priority", { ascending: false });
  else if (sort === "name") q = q.order("name", { ascending: true });
  else if (sort === "end_asc") q = q.order("end_date", { ascending: true, nullsFirst: false });
  else if (sort === "created_desc") q = q.order("created_at", { ascending: false });
  else q = q.order("status");

  const { data } = await q;
  const projects = (data ?? []) as unknown as Project[];

  return (
    <>
      <PageHeader
        title="Projekt"
        subtitle="Pågående arbete — framsteg beräknas automatiskt från uppgifter."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="status" />
            <NewProjectButton />
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {!projects.length && (
          <div className="col-span-full glass rounded-card p-10 text-center text-sm text-[var(--muted)]">
            Inga projekt än.
          </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const total = p.tasks?.length ?? 0;
  const done = (p.tasks ?? []).filter((t) => t.status === "done").length;
  const inProgress = (p.tasks ?? []).filter((t) => t.status === "in_progress").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      href={`/admin/projects/${p.id}`}
      className="glass rounded-card p-5 flex flex-col gap-4 hover:border-white/15 hover:bg-white/[0.02] transition-colors block"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-base leading-tight">{p.name}</h3>
          {p.customer?.name && (
            <div className="mt-1 text-xs text-[var(--muted)]">{p.customer.name}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Chip tone={statusTone(p.status)}>{statusLabel(p.status)}</Chip>
          {p.priority && (
            <Chip tone={p.priority === "high" ? "red" : p.priority === "medium" ? "yellow" : "gray"}>
              {priorityLabel(p.priority)}
            </Chip>
          )}
        </div>
      </header>

      {p.summary && (
        <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-3">{p.summary}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--muted)]">Framsteg</span>
          <span className="font-mono text-white">
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--triad-teal)] to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-3 text-[11px] text-[var(--muted)]">
          <Dot color="bg-[var(--triad-teal)]" /> {done} klara
          <Dot color="bg-amber-400" /> {inProgress} pågår
          <Dot color="bg-white/30" /> {total - done - inProgress} att göra
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-[var(--muted)]">
        <span>{p.owner?.display_name ?? "Okänd ägare"}</span>
        <span>
          {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
        </span>
      </footer>
    </Link>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
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

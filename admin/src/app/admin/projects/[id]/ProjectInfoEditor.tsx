"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X, ExternalLink, Github } from "lucide-react";
import { fmtDate } from "@/lib/date";
import { DateInput } from "@/components/DateInput";

type Profile = { id: string; display_name: string | null; email: string | null };
type Customer = { id: string; name: string };

type ProjectInfo = {
  id: string;
  status: string | null;
  priority: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  customer_id: string | null;
  summary: string | null;
  external_url: string | null;
  github_owner: string | null;
  github_repo: string | null;
};

const STATUSES = [
  { value: "idea", label: "Idé" },
  { value: "backlog", label: "Backlog" },
  { value: "planning", label: "Planering" },
  { value: "in_progress", label: "Pågår" },
  { value: "paused", label: "Pausat" },
  { value: "done", label: "Klart" },
  { value: "canceled", label: "Avbrutet" },
];

export function ProjectInfoEditor({
  project,
  owner,
  profiles,
  customers,
}: {
  project: ProjectInfo;
  owner: { id: string; display_name: string | null } | null;
  profiles: Profile[];
  customers: Customer[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    status: project.status ?? "idea",
    priority: project.priority ?? "medium",
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? "",
    owner_id: project.owner_id ?? "",
    customer_id: project.customer_id ?? "",
    summary: project.summary ?? "",
    external_url: project.external_url ?? "",
    github: project.github_owner && project.github_repo
      ? `${project.github_owner}/${project.github_repo}`
      : "",
  });

  async function save() {
    const repo = parseRepoRef(f.github);
    if (f.github.trim() && !repo) {
      alert("Ogiltigt GitHub-repo. Använd formatet owner/repo eller en github.com-länk.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        status: f.status,
        priority: f.priority,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
        owner_id: f.owner_id || null,
        customer_id: f.customer_id || null,
        summary: f.summary || null,
        external_url: f.external_url.trim() ? normalizeUrl(f.external_url.trim()) : null,
        github_owner: repo?.owner ?? null,
        github_repo: repo?.repo ?? null,
      })
      .eq("id", project.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    const ownerName = owner?.display_name ?? "—";
    return (
      <div className="space-y-3 text-sm">
        <Row label="Status">{statusLabel(project.status)}</Row>
        <Row label="Prioritet">{priorityLabel(project.priority)}</Row>
        <Row label="Startdatum">{fmtDate(project.start_date)}</Row>
        <Row label="Slutdatum">{fmtDate(project.end_date)}</Row>
        <Row label="Ansvarig">{ownerName}</Row>
        <Row label="Länk">
          {project.external_url ? (
            <a
              href={project.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--triad-teal)] hover:underline max-w-full"
            >
              <span className="truncate">{prettyUrl(project.external_url)}</span>
              <ExternalLink size={11} className="opacity-70 shrink-0" />
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="GitHub">
          {project.github_owner && project.github_repo ? (
            <a
              href={`https://github.com/${project.github_owner}/${project.github_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--triad-teal)] hover:underline max-w-full"
            >
              <Github size={11} className="shrink-0 opacity-70" />
              <span className="truncate">
                {project.github_owner}/{project.github_repo}
              </span>
            </a>
          ) : (
            "—"
          )}
        </Row>
        <button
          onClick={() => setEditing(true)}
          className="mt-2 w-full rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-white inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          Redigera
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <Field label="Status">
        <select
          value={f.status}
          onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Prioritet">
        <select
          value={f.priority}
          onChange={(e) => setF((p) => ({ ...p, priority: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        >
          <option value="low">Låg</option>
          <option value="medium">Medel</option>
          <option value="high">Hög</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start">
          <DateInput
            value={f.start_date}
            onChange={(v) => setF((p) => ({ ...p, start_date: v }))}
            ariaLabel="Startdatum"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Slut">
          <DateInput
            value={f.end_date}
            onChange={(v) => setF((p) => ({ ...p, end_date: v }))}
            ariaLabel="Slutdatum"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
          />
        </Field>
      </div>
      <Field label="Ansvarig">
        <select
          value={f.owner_id}
          onChange={(e) => setF((p) => ({ ...p, owner_id: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        >
          <option value="">— ingen —</option>
          {profiles.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.display_name ?? pr.email ?? pr.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kund">
        <select
          value={f.customer_id}
          onChange={(e) => setF((p) => ({ ...p, customer_id: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        >
          <option value="">— ingen —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Länk">
        <input
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={f.external_url}
          onChange={(e) => setF((p) => ({ ...p, external_url: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        />
      </Field>
      <Field label="GitHub-repo">
        <input
          type="text"
          placeholder="owner/repo"
          value={f.github}
          onChange={(e) => setF((p) => ({ ...p, github: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        />
      </Field>
      <Field label="Sammanfattning">
        <textarea
          value={f.summary}
          rows={3}
          onChange={(e) => setF((p) => ({ ...p, summary: e.target.value }))}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
        />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={() => setEditing(false)}
          className="rounded-btn px-3 py-1.5 text-xs text-[var(--muted)] inline-flex items-center gap-1"
        >
          <X size={12} /> Avbryt
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Check size={12} /> {saving ? "Sparar…" : "Spara"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--muted)] uppercase tracking-wider">{label}</span>
      <span className="text-white text-right text-sm">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Klient-sidans motsvarighet till parseRepoRef i lib/github.ts (som är
// server-only). Tolkar "owner/repo" eller en github.com-länk.
function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  const slug = raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (slug) return { owner: slug[1], repo: slug[2] };
  const url = raw.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (url) return { owner: url[1], repo: url[2] };
  return null;
}

function normalizeUrl(raw: string) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
function prettyUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return raw;
  }
}
function statusLabel(s: string | null) {
  return STATUSES.find((x) => x.value === s)?.label ?? s ?? "—";
}
function priorityLabel(p: string | null) {
  return p === "high" ? "Hög" : p === "medium" ? "Medel" : p === "low" ? "Låg" : p ?? "—";
}

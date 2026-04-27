"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { TaskCard, type Task } from "@/app/admin/tasks/TaskCard";

export type ProjectTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  start_at: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  assignee?: { id: string; display_name: string | null } | null;
  project?: { id: string; name: string } | null;
};

type Profile = { id: string; display_name: string | null; email: string | null };

const COLUMNS: { key: "not_started" | "in_progress" | "done"; label: string; accent: string }[] = [
  { key: "not_started", label: "Att göra", accent: "bg-white/30" },
  { key: "in_progress", label: "Pågår", accent: "bg-amber-400" },
  { key: "done", label: "Klart", accent: "bg-[var(--triad-teal)]" },
];

export function ProjectTaskList({
  projectId,
  initial,
  profiles,
}: {
  projectId: string;
  initial: ProjectTask[];
  profiles: Profile[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: "",
    description: "",
    priority: "medium",
    start_at: "",
    due_at: "",
    assignee_id: "",
  });

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: f.title.trim(),
      description: f.description || null,
      priority: f.priority,
      status: "not_started",
      start_at: f.start_at ? new Date(f.start_at).toISOString() : null,
      due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
      assignee_id: f.assignee_id || null,
      project_id: projectId,
    });
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setF({ title: "", description: "", priority: "medium", start_at: "", due_at: "", assignee_id: "" });
    setAdding(false);
    router.refresh();
  }

  // Group by status for column-style display
  const groups: Record<string, ProjectTask[]> = { not_started: [], in_progress: [], done: [] };
  for (const t of initial) {
    (groups[t.status] ??= []).push(t);
  }

  return (
    <div className="space-y-4">
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-btn border border-dashed border-white/15 hover:border-teal-400/40 hover:bg-white/5 px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-white inline-flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          Lägg till uppgift
        </button>
      ) : (
        <form onSubmit={quickAdd} className="space-y-2 rounded-btn border border-white/10 bg-black/20 p-3">
          <input
            autoFocus
            value={f.title}
            onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
            placeholder="Vad ska göras?"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <textarea
            value={f.description}
            onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
            rows={2}
            placeholder="Beskrivning (valfri)"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
              Start
              <input
                type="date"
                value={f.start_at}
                onChange={(e) => setF((p) => ({ ...p, start_at: e.target.value }))}
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-2 py-2 text-xs text-white"
              />
            </label>
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
              Deadline
              <input
                type="date"
                value={f.due_at}
                onChange={(e) => setF((p) => ({ ...p, due_at: e.target.value }))}
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-2 py-2 text-xs text-white"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={f.priority}
              onChange={(e) => setF((p) => ({ ...p, priority: e.target.value }))}
              className="rounded-btn bg-black/30 border border-white/10 px-2 py-2 text-xs text-white"
            >
              <option value="low">Låg</option>
              <option value="medium">Medel</option>
              <option value="high">Hög</option>
            </select>
            <select
              value={f.assignee_id}
              onChange={(e) => setF((p) => ({ ...p, assignee_id: e.target.value }))}
              className="rounded-btn bg-black/30 border border-white/10 px-2 py-2 text-xs text-white"
            >
              <option value="">Tilldela…</option>
              {profiles.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.display_name ?? pr.email ?? pr.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-btn px-3 py-1.5 text-xs text-[var(--muted)]"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "Sparar…" : "Lägg till"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = groups[col.key] ?? [];
          return (
            <section key={col.key} className="rounded-card bg-black/15 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wider">{col.label}</h3>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--muted)]">
                  {items.length}
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.id}>
                    <TaskCard task={taskToCardTask(t)} />
                  </li>
                ))}
                {!items.length && (
                  <li className="rounded-btn border border-dashed border-white/5 py-6 text-center text-[11px] text-[var(--muted)]">
                    Inget här.
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function taskToCardTask(t: ProjectTask): Task {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    start_at: t.start_at,
    due_at: t.due_at,
    description: t.description,
    project: t.project ?? null,
    assignee: t.assignee ?? null,
  };
}

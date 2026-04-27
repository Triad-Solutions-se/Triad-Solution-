"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type TaskInput = {
  id?: string;
  title: string;
  description: string | null;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  status: string;
  assignee_ids: string[];
  project_id: string | null;
};

type Profile = { id: string; display_name: string | null };
type Project = { id: string; name: string };

export function TaskFormModal({
  initial,
  onClose,
  mode,
}: {
  initial?: Partial<TaskInput>;
  onClose: () => void;
  mode: "create" | "edit";
}) {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [status, setStatus] = useState(initial?.status ?? "not_started");
  const [start, setStart] = useState(
    initial?.start_at ? initial.start_at.slice(0, 10) : "",
  );
  const [due, setDue] = useState(
    initial?.due_at ? initial.due_at.slice(0, 10) : "",
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assignee_ids ?? []);
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: pr }] = await Promise.all([
        supabase.from("profiles").select("id,display_name").order("display_name"),
        supabase.from("projects").select("id,name").order("name"),
      ]);
      setProfiles((p ?? []) as Profile[]);
      setProjects((pr ?? []) as Project[]);
    })();
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    const payload = {
      title: title.trim(),
      description: description?.trim() || null,
      priority,
      status,
      start_at: start ? new Date(start).toISOString() : null,
      due_at: due ? new Date(due).toISOString() : null,
      assignee_ids: assigneeIds,
      project_id: projectId || null,
      completed_at: status === "done" ? new Date().toISOString() : null,
    };
    const { error } =
      mode === "edit" && initial?.id
        ? await supabase.from("tasks").update(payload).eq("id", initial.id)
        : await supabase.from("tasks").insert(payload);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm("Radera uppgift?")) return;
    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", initial.id);
    setDeleting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="w-full max-w-lg glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="font-heading text-lg font-semibold">
          {mode === "edit" ? "Redigera uppgift" : "Ny uppgift"}
        </h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Vad ska göras?"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
        />

        <textarea
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Beskrivning (valfritt)"
          rows={3}
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Projekt">
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            >
              <option value="">Inget projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tilldelade" className="col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {profiles.length === 0 && (
                <span className="text-xs text-[var(--muted)]">Inga medlemmar.</span>
              )}
              {profiles.map((p) => {
                const selected = assigneeIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setAssigneeIds((curr) =>
                        selected ? curr.filter((x) => x !== p.id) : [...curr, p.id],
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-teal-500/20 border-teal-400/40 text-teal-200"
                        : "bg-black/30 border-white/10 text-[var(--muted)] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {p.display_name ?? "Okänd"}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Startdatum">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Deadline">
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Prioritet">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            >
              <option value="low">Låg</option>
              <option value="medium">Medel</option>
              <option value="high">Hög</option>
            </select>
          </Field>

          {mode === "edit" && (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              >
                <option value="not_started">Att göra</option>
                <option value="in_progress">Pågår</option>
                <option value="done">Klart</option>
              </select>
            </Field>
          )}
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}

        <div className="flex items-center justify-between gap-2 pt-2">
          {mode === "edit" ? (
            <button
              type="button"
              onClick={remove}
              disabled={deleting || saving}
              className="rounded-btn px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              {deleting ? "Raderar…" : "Radera"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="rounded-btn bg-[var(--triad-teal)] text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

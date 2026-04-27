"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/Chip";
import { TaskFormModal } from "./TaskForm";

export type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  start_at: string | null;
  due_at: string | null;
  description: string | null;
  project?: { id: string; name: string } | null;
  assignees?: Array<{ id: string; display_name: string | null }>;
};

const priorityBorder: Record<string, string> = {
  high: "border-l-rose-400",
  medium: "border-l-amber-400",
  low: "border-l-emerald-400",
};

const assigneeColors = [
  "bg-purple-500/20 text-purple-300",
  "bg-blue-500/20 text-blue-300",
  "bg-teal-500/20 text-teal-300",
  "bg-orange-500/20 text-orange-300",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return assigneeColors[Math.abs(hash) % assigneeColors.length];
}

export function TaskCard({ task }: { task: Task }) {
  const supabase = createClient();
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(task.status);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const done = optimistic === "done";
  const borderAccent = task.priority ? (priorityBorder[task.priority] ?? "border-l-white/10") : "border-l-white/10";

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = done ? "not_started" : "done";
    setOptimistic(next);
    await supabase
      .from("tasks")
      .update({ status: next, completed_at: next === "done" ? new Date().toISOString() : null })
      .eq("id", task.id);
    startTransition(() => router.refresh());
  }

  const overdue = task.due_at && !done && new Date(task.due_at) < new Date();
  const assignees = task.assignees ?? [];

  return (
    <>
      <div
        onClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(true);
        }}
        className={`group relative cursor-pointer rounded-xl border border-white/8 border-l-[3px] ${borderAccent} bg-black/20 p-3 transition-all hover:bg-black/30 hover:border-white/12 ${
          isPending ? "opacity-70" : ""
        } ${done ? "opacity-60" : ""}`}
      >
        <div className="flex items-start gap-2.5">
          <button
            onClick={toggle}
            aria-label={done ? "Markera som ej klar" : "Markera som klar"}
            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border transition-all touch-manipulation ${
              done
                ? "border-teal-400 bg-teal-400 text-black"
                : "border-white/25 bg-transparent hover:border-teal-400/60"
            }`}
          >
            {done && (
              <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2.5 7.5 L5.5 10.5 L11.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className={`text-sm leading-snug ${done ? "text-white/40 line-through" : "text-white"}`}>
              {task.title}
            </div>
            {task.description && (
              <div className={`mt-1 line-clamp-2 text-xs ${done ? "text-white/25" : "text-[var(--muted)]"}`}>
                {task.description}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {task.priority && (
                <Chip tone={task.priority === "high" ? "red" : task.priority === "medium" ? "yellow" : "gray"}>
                  {priorityLabel(task.priority)}
                </Chip>
              )}
              {task.project?.name && <Chip tone="teal">{task.project.name}</Chip>}
              {assignees.length > 0 ? (
                <span className="inline-flex items-center -space-x-1.5 shrink-0">
                  {assignees.slice(0, 3).map((a) => {
                    const name = a.display_name ?? "?";
                    const initials = name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);
                    return (
                      <span
                        key={a.id}
                        title={name}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-[var(--surface)] ${avatarColor(name)}`}
                      >
                        {initials}
                      </span>
                    );
                  })}
                  {assignees.length > 3 && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-[var(--surface)] bg-white/10 text-[var(--muted)]">
                      +{assignees.length - 3}
                    </span>
                  )}
                </span>
              ) : (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold shrink-0 bg-white/10 text-[var(--muted)]"
                  title="Ingen tilldelad"
                >
                  T
                </span>
              )}
              {task.due_at && (
                <span
                  className={`text-[11px] ${
                    overdue ? "font-medium text-rose-300" : done ? "text-white/30" : "text-[var(--muted)]"
                  }`}
                >
                  {overdue && "⚠ "}
                  {new Date(task.due_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <TaskFormModal
          mode="edit"
          onClose={() => setEditing(false)}
          initial={{
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority ?? "medium",
            start_at: task.start_at,
            due_at: task.due_at,
            status: task.status,
            assignee_ids: assignees.map((a) => a.id),
            project_id: task.project?.id ?? null,
          }}
        />
      )}
    </>
  );
}

function priorityLabel(p: string) {
  return p === "high" ? "Hög" : p === "medium" ? "Medel" : "Låg";
}

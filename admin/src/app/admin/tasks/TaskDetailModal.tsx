"use client";
import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Pencil, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";
import type { Task } from "./TaskCard";
import { TaskFormModal } from "./TaskForm";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Att göra",
  in_progress: "Pågår",
  done: "Klart",
  archived: "Arkiverad",
};

const STATUS_TONE: Record<string, "gray" | "teal" | "green" | "yellow"> = {
  not_started: "gray",
  in_progress: "teal",
  done: "green",
  archived: "yellow",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "Hög",
  medium: "Medel",
  low: "Låg",
};

export function TaskDetailModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const assignees = task.assignees ?? [];
  const overdue =
    task.due_at && task.status !== "done" && new Date(task.due_at) < new Date();

  if (editing) {
    return (
      <TaskFormModal
        mode="edit"
        onClose={() => {
          setEditing(false);
          onClose();
        }}
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
          estimate_hours: task.estimate_hours ?? null,
        }}
      />
    );
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass rounded-modal p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <Chip tone={STATUS_TONE[task.status] ?? "gray"}>
                {STATUS_LABEL[task.status] ?? task.status}
              </Chip>
              {task.priority && (
                <Chip
                  tone={
                    task.priority === "high"
                      ? "red"
                      : task.priority === "medium"
                      ? "yellow"
                      : "gray"
                  }
                >
                  {PRIORITY_LABEL[task.priority] ?? task.priority} prio
                </Chip>
              )}
              {overdue && <Chip tone="red">Försenad</Chip>}
            </div>
            <h3 className="font-heading text-lg font-semibold leading-tight">
              {task.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-btn text-[var(--muted)] hover:text-white hover:bg-white/5 shrink-0"
            aria-label="Stäng"
          >
            <X size={16} />
          </button>
        </header>

        {task.description && (
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Projekt">
            {task.project?.name ? (
              <span className="text-white">{task.project.name}</span>
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </Field>
          <Field label="Startdatum">
            <span className="text-white">{fmtDate(task.start_at)}</span>
          </Field>
          <Field label="Deadline">
            <span className={overdue ? "text-rose-300 font-medium" : "text-white"}>
              {fmtDate(task.due_at)}
            </span>
          </Field>
          <Field label="Tilldelade" className="col-span-2">
            {assignees.length === 0 ? (
              <span className="text-[var(--muted)]">Ingen tilldelad</span>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {assignees.map((a) => (
                  <li
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs"
                  >
                    {a.display_name ?? "Okänd"}
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </dl>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/5">
          <button
            onClick={() => setEditing(true)}
            className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-white inline-flex items-center gap-2"
          >
            <Pencil size={14} />
            Redigera
          </button>
          {task.project?.id && (
            <Link
              href={`/admin/projects/${task.project.id}#task-${task.id}`}
              onClick={onClose}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
            >
              <ExternalLink size={14} />
              Gå till projektet
            </Link>
          )}
        </div>
      </div>
    </Modal>
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
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

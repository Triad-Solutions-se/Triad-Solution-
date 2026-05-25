"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TaskDetailModal } from "@/app/admin/tasks/TaskDetailModal";
import type { Task } from "@/app/admin/tasks/TaskCard";

// Wraps a row of static markup on the overview dashboard. Clicking (or
// pressing Enter) anywhere outside the checkbox opens the read-only
// TaskDetailModal; the checkbox flips status between done / not_started
// optimistically and refreshes the route so the list re-queries.
export function DashboardTaskRow({
  task,
  className,
  children,
}: {
  task: Task;
  className?: string;
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState(task.status);
  useEffect(() => setOptimistic(task.status), [task.status]);
  const [isPending, startTransition] = useTransition();
  const done = optimistic === "done";

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

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`cursor-pointer ${isPending ? "opacity-70" : ""} ${className ?? ""}`}
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={done ? "Markera som ej klar" : "Markera som klar"}
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all touch-manipulation ${
              done
                ? "border-teal-400 bg-teal-400 text-black"
                : "border-white/25 bg-transparent hover:border-teal-400/60"
            }`}
          >
            {done && (
              <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2.5 7.5 L5.5 10.5 L11.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <div className={`min-w-0 flex-1 ${done ? "opacity-50" : ""}`}>{children}</div>
        </div>
      </div>
      {open && <TaskDetailModal task={{ ...task, status: optimistic }} onClose={() => setOpen(false)} />}
    </>
  );
}

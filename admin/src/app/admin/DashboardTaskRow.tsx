"use client";
import { useState } from "react";
import { TaskDetailModal } from "@/app/admin/tasks/TaskDetailModal";
import type { Task } from "@/app/admin/tasks/TaskCard";

// Wraps a row of static markup on the overview dashboard so clicking
// (or pressing Enter) opens the read-only TaskDetailModal — same UX
// as a TaskCard, but without bringing in the full card visual.
export function DashboardTaskRow({
  task,
  className,
  children,
}: {
  task: Task;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`cursor-pointer ${className ?? ""}`}
      >
        {children}
      </div>
      {open && <TaskDetailModal task={task} onClose={() => setOpen(false)} />}
    </>
  );
}

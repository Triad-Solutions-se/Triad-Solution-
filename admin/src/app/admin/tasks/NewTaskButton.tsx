"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { TaskFormModal } from "./TaskForm";

export function NewTaskButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Plus size={16} />
        Ny uppgift
      </button>
      {open && <TaskFormModal mode="create" onClose={() => setOpen(false)} />}
    </>
  );
}

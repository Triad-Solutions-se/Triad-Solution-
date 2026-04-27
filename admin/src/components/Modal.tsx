"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders children to document.body so modals escape any ancestor that
// creates a containing block (e.g. .glass with backdrop-filter, or
// transform/filter parents). Without this, `position: fixed` is contained
// by that ancestor and the modal is cropped to it instead of the viewport.
export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

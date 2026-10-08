"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders children to document.body so modals escape any ancestor that
// creates a containing block (e.g. .glass with backdrop-filter, or
// transform/filter parents). Without this, `position: fixed` is contained
// by that ancestor and the modal is cropped to it instead of the viewport.
// `sheet` docks the content to the bottom edge on phones (centered from sm up).
export function Modal({
  open,
  onClose,
  sheet = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  sheet?: boolean;
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
      className={`fixed inset-0 bg-black/60 grid z-50 ${
        sheet ? "items-end justify-items-center sm:place-items-center sm:p-4" : "place-items-center p-4"
      }`}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

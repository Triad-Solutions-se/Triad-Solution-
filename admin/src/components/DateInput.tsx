"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

// Custom date picker with a Monday-first (EU standard) week layout. Native
// <input type="date"> calendars follow the browser locale and cannot be
// forced to start the week on Monday, so we render our own popover. The
// `value`/`onChange` contract mirrors a native date input: an ISO
// "YYYY-MM-DD" string, or "" when no date is set.

const WEEKDAYS = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const POPOVER_W = 268;
const POPOVER_H = 332;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function displayDate(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

// 42 days (6 weeks) covering `cursor`'s month, aligned so each row is Mon–Sun.
function buildGrid(cursor: Date): Date[] {
  const first = firstOfMonth(cursor);
  const offset = (first.getDay() + 6) % 7; // Sunday(0) → 6, Monday(1) → 0
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function DateInput({
  value,
  onChange,
  className = "w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white",
  placeholder = "Välj datum",
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [cursor, setCursor] = useState(() => firstOfMonth(parseISO(value) ?? new Date()));

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = Math.min(r.left, window.innerWidth - POPOVER_W - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    if (top + POPOVER_H > window.innerHeight - 8) {
      const above = r.top - 4 - POPOVER_H;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - 8 - POPOVER_H);
    }
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    const handler = () => computePos();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, computePos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = parseISO(value);
  const todayIso = toISO(new Date());

  function openPicker() {
    setCursor(firstOfMonth(parseISO(value) ?? new Date()));
    setOpen(true);
  }
  function pick(d: Date) {
    onChange(toISO(d));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selected ? "" : "text-[var(--muted)]"}>
          {selected ? displayDate(selected) : placeholder}
        </span>
        <CalendarIcon size={15} className="text-[var(--muted)] shrink-0" />
      </button>

      {open && mounted && pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
            className="fixed z-[60] glass rounded-xl border border-white/10 p-3 shadow-xl shadow-fixed-black/40"
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                className="p-1.5 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
                aria-label="Föregående månad"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium capitalize">
                {cursor.toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                className="p-1.5 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
                aria-label="Nästa månad"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-[10px] uppercase py-1 ${
                    i >= 5 ? "text-[var(--muted)]/60" : "text-[var(--muted)]"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {buildGrid(cursor).map((d, i) => {
                const iso = toISO(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isSelected = selected && iso === toISO(selected);
                const isToday = iso === todayIso;
                const weekend = i % 7 >= 5;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pick(d)}
                    className={`h-8 rounded-md text-xs transition-colors ${
                      isSelected
                        ? "bg-teal-400 text-fixed-black font-semibold"
                        : isToday
                        ? "ring-1 ring-teal-400 text-white hover:bg-white/10"
                        : inMonth
                        ? `${weekend ? "text-[var(--muted)]" : "text-white"} hover:bg-white/10`
                        : "text-[var(--muted)]/40 hover:bg-white/5"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="text-xs text-teal-300 hover:text-teal-200 px-1"
              >
                Idag
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs text-[var(--muted)] hover:text-white px-1"
              >
                Rensa
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

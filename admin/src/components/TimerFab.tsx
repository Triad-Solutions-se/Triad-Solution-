"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Timer, Play, Square, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "./Modal";
import { useNow, useTimer } from "./TimerProvider";
import { fmtClock } from "@/lib/date";

type PickerProject = { id: string; name: string; customer: { name: string } | null };

// Routes with their own full-height layout and a bottom-right send button.
const HIDDEN_ON = ["/admin/supermind"];

// Quick start/stop for project timers. A round button on phones; while a timer
// runs it turns into a live clock pill (shown on desktop too, so a running
// timer is never forgotten). Tapping opens a bottom sheet to stop or switch.
export function TimerFab() {
  const { ready, running, busy, start, stop } = useTimer();
  const pathname = usePathname();
  const now = useNow(!!running);
  const [open, setOpen] = useState(false);

  if (!ready || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const elapsed = running && now != null ? now - Date.parse(running.started_at) : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={running ? `Timer går: ${running.project_name}` : "Starta timer"}
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        className={`fixed right-4 z-40 flex items-center rounded-full shadow-lg shadow-black/40 transition-colors ${
          running
            ? "gap-2 bg-rose-500 hover:bg-rose-400 text-white pl-3.5 pr-4 h-12 max-w-[calc(100vw-2rem)]"
            : "lg:hidden justify-center h-14 w-14 bg-teal-500 hover:bg-teal-400 text-white"
        }`}
      >
        {running ? (
          <>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span className="font-mono text-sm tabular-nums">{fmtClock(elapsed)}</span>
            <span className="text-sm font-medium truncate max-w-[9rem]">{running.project_name}</span>
          </>
        ) : (
          <Timer size={24} />
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} sheet>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          className="w-full sm:max-w-md bg-[var(--surface)] border border-white/10 rounded-t-modal sm:rounded-modal p-5 max-h-[85vh] flex flex-col shadow-modal"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

          {running && (
            <div className="mb-5 rounded-card border border-rose-500/25 bg-rose-500/10 p-4">
              <div className="text-[10px] uppercase tracking-wider text-rose-200/80">Timer går</div>
              <Link
                href={`/admin/projects/${running.project_id}`}
                onClick={() => setOpen(false)}
                className="mt-1 block font-heading font-semibold truncate hover:underline"
              >
                {running.project_name}
              </Link>
              <div className="mt-1 font-mono text-3xl tabular-nums">{fmtClock(elapsed)}</div>
              <button
                onClick={async () => {
                  await stop();
                  setOpen(false);
                }}
                disabled={busy}
                className="mt-4 w-full rounded-btn bg-rose-500 hover:bg-rose-400 text-white py-3 text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Square size={16} fill="currentColor" />}
                Stoppa timer
              </button>
            </div>
          )}

          <ProjectPicker
            heading={running ? "Byt projekt" : "Starta timer på"}
            currentId={running?.project_id ?? null}
            disabled={busy}
            onPick={async (p) => {
              await start(p);
              setOpen(false);
            }}
          />
        </div>
      </Modal>
    </>
  );
}

function ProjectPicker({
  heading,
  currentId,
  disabled,
  onPick,
}: {
  heading: string;
  currentId: string | null;
  disabled: boolean;
  onPick: (p: { id: string; name: string }) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useTimer();
  const [projects, setProjects] = useState<PickerProject[] | null>(null);
  const [q, setQ] = useState("");

  // Loaded each time the sheet opens (the picker mounts with it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projRes, recentRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,customer:customers(name)")
          .not("status", "in", "(idea,done,canceled)")
          .order("name"),
        userId
          ? supabase
              .from("time_entries")
              .select("project_id")
              .eq("profile_id", userId)
              .order("started_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as { project_id: string }[] }),
      ]);
      if (cancelled) return;
      // Projects you timed most recently first, the rest alphabetically.
      const rank = new Map<string, number>();
      for (const r of (recentRes.data ?? []) as { project_id: string }[]) {
        if (!rank.has(r.project_id)) rank.set(r.project_id, rank.size);
      }
      const list = ((projRes.data ?? []) as unknown as PickerProject[]).sort(
        (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      );
      setProjects(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const needle = q.trim().toLowerCase();
  const visible = (projects ?? []).filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.customer?.name.toLowerCase().includes(needle),
  );

  return (
    <div className="flex flex-col min-h-0">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">{heading}</div>
      <label className="relative mb-2 block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök projekt"
          className="w-full rounded-btn bg-black/30 border border-white/10 pl-9 pr-3 py-2.5 text-base sm:text-sm"
        />
      </label>

      <ul className="overflow-y-auto min-h-0 -mx-1 px-1 space-y-1">
        {projects == null && (
          <li className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--muted)]">
            <Loader2 size={14} className="animate-spin" /> Hämtar projekt…
          </li>
        )}
        {projects != null && visible.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">Inga projekt hittades.</li>
        )}
        {visible.map((p) => {
          const current = p.id === currentId;
          return (
            <li key={p.id}>
              <button
                onClick={() => onPick({ id: p.id, name: p.name })}
                disabled={disabled || current}
                className={`w-full flex items-center gap-3 rounded-btn px-3 py-3 text-left transition-colors ${
                  current ? "bg-white/5 opacity-60" : "hover:bg-white/5 active:bg-white/10"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.customer?.name && (
                    <div className="text-xs text-[var(--muted)] truncate">{p.customer.name}</div>
                  )}
                </div>
                {current ? (
                  <span className="text-[11px] text-rose-300 shrink-0">Pågår</span>
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-500/15 text-teal-300">
                    <Play size={14} fill="currentColor" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useNow, useTimer } from "@/components/TimerProvider";
import { fmtClock, fmtDuration } from "@/lib/date";

export type TimeEntry = {
  id: string;
  profile_id: string;
  started_at: string;
  ended_at: string | null;
};

type Profile = { id: string; display_name: string | null; email: string | null };

// Header button: start the timer on this project, or stop it while it runs here.
export function ProjectTimerButton({ project }: { project: { id: string; name: string } }) {
  const { ready, running, busy, start, stop } = useTimer();
  const here = running?.project_id === project.id;
  const now = useNow(here);

  if (here) {
    const elapsed = now != null ? now - Date.parse(running.started_at) : 0;
    return (
      <button
        onClick={stop}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-btn bg-rose-500 hover:bg-rose-400 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={12} fill="currentColor" />}
        Stoppa
        <span className="font-mono tabular-nums">{fmtClock(elapsed)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => start(project)}
      disabled={!ready || busy}
      title={running ? `Timer går på ${running.project_name}` : undefined}
      className="inline-flex items-center gap-2 rounded-btn border border-white/10 bg-white/5 hover:bg-white/10 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Play size={12} fill="currentColor" className="text-teal-300" />
      )}
      {running ? "Byt timer hit" : "Starta timer"}
    </button>
  );
}

// Aside section: logged time on the project — totals, per person, recent passes.
export function ProjectTimeLog({
  entries,
  profiles,
  renderedAt,
}: {
  entries: TimeEntry[];
  profiles: Profile[];
  renderedAt: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { userId } = useTimer();
  const anyRunning = entries.some((e) => !e.ended_at);
  const now = useNow(anyRunning) ?? renderedAt;
  const [showAll, setShowAll] = useState(false);

  const nameOf = new Map(
    profiles.map((p) => [p.id, p.display_name ?? p.email?.split("@")[0] ?? "Okänd"]),
  );
  const startOf = (e: TimeEntry) => Date.parse(e.started_at);
  const endOf = (e: TimeEntry) => (e.ended_at ? Date.parse(e.ended_at) : now);
  const weekStart = mondayOf(now);

  let total = 0;
  let week = 0;
  const perPerson = new Map<string, { ms: number; running: boolean }>();
  for (const e of entries) {
    const ms = Math.max(0, endOf(e) - startOf(e));
    total += ms;
    week += Math.max(0, endOf(e) - Math.max(startOf(e), weekStart));
    const p = perPerson.get(e.profile_id) ?? { ms: 0, running: false };
    p.ms += ms;
    if (!e.ended_at) p.running = true;
    perPerson.set(e.profile_id, p);
  }
  const people = [...perPerson.entries()].sort((a, b) => b[1].ms - a[1].ms);
  const recent = showAll ? entries : entries.slice(0, 6);

  async function remove(e: TimeEntry) {
    if (!confirm(`Ta bort passet ${fmtDay(e.started_at)} (${fmtDuration(endOf(e) - startOf(e))})?`)) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", e.id);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-white/10 p-6 text-center text-xs text-[var(--muted)]">
        Ingen tid loggad än. Starta timern när du jobbar på projektet.
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Totalt" value={fmtDuration(total)} />
        <Stat label="Denna vecka" value={fmtDuration(week)} />
      </div>

      <ul className="space-y-1.5">
        {people.map(([pid, p]) => (
          <li key={pid} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.running ? "bg-rose-400 animate-pulse" : "bg-white/20"}`}
                title={p.running ? "Timer går" : undefined}
              />
              <span className="truncate">{nameOf.get(pid) ?? "Okänd"}</span>
            </span>
            <span className="font-mono text-[var(--muted)]">{fmtDuration(p.ms)}</span>
          </li>
        ))}
      </ul>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">Senaste pass</div>
        <ul className="divide-y divide-white/5">
          {recent.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {nameOf.get(e.profile_id) ?? "Okänd"}
                  <span className="text-[var(--muted)]"> · {fmtDay(e.started_at)}</span>
                </div>
                <div className="text-[var(--muted)]">
                  {fmtTime(e.started_at)}–{e.ended_at ? fmtTime(e.ended_at) : "pågår"}
                </div>
              </div>
              <span className={`font-mono shrink-0 ${e.ended_at ? "" : "text-rose-300"}`}>
                {e.ended_at ? fmtDuration(endOf(e) - startOf(e)) : fmtClock(endOf(e) - startOf(e))}
              </span>
              {e.ended_at && e.profile_id === userId && (
                <button
                  onClick={() => remove(e)}
                  aria-label="Ta bort pass"
                  className="p-1 rounded text-[var(--muted)] hover:text-rose-300 hover:bg-white/5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {entries.length > 6 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 text-xs text-[var(--muted)] hover:text-white"
          >
            {showAll ? "Visa färre" : `Visa alla (${entries.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn bg-black/20 border border-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="font-mono text-base text-white">{value}</div>
    </div>
  );
}

// Fixed to Swedish time so the server render and the browser agree.
const TZ = "Europe/Stockholm";
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ, day: "numeric", month: "short" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

// Monday 00:00 local time of the week containing `ms`.
function mondayOf(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

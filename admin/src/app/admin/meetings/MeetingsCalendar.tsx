"use client";
import { useMemo, useState } from "react";

type Meeting = { id: string; name: string; date: string | null; type: string | null };

export function MeetingsCalendar({ meetings }: { meetings: Meeting[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  const weeks = useMemo(() => buildMonth(cursor), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    meetings.forEach((m) => {
      if (!m.date) return;
      const k = new Date(m.date).toISOString().slice(0, 10);
      (map.get(k) ?? map.set(k, []).get(k))!.push(m);
    });
    return map;
  }, [meetings]);

  const monthName = cursor.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="glass rounded-xl border border-white/10 p-2 sm:p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-sm sm:text-lg font-bold capitalize">{monthName}</h2>
        <div className="flex gap-0.5 sm:gap-1">
          <button
            onClick={() => shift(-1)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-btn text-sm hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            ‹
          </button>
          <button
            onClick={() => setCursor(firstOfMonth(new Date()))}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-btn text-xs sm:text-sm hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            <span className="hidden sm:inline">Idag</span>
            <span className="sm:hidden">•</span>
          </button>
          <button
            onClick={() => shift(1)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-btn text-sm hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            ›
          </button>
        </div>
      </div>
      <div className="w-full">
        <div className="grid grid-cols-7 text-[10px] sm:text-xs text-[var(--muted)] uppercase tracking-wider mb-1 sm:mb-2">
          {[
            ["M","Mån"],["T","Tis"],["O","Ons"],["T","Tor"],["F","Fre"],["L","Lör"],["S","Sön"],
          ].map(([short, full], i) => (
            <div key={i} className="py-1 text-center">
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{full}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {weeks.flat().map((d, i) => {
            const iso = d.toISOString().slice(0, 10);
            const items = byDay.get(iso) ?? [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const today = iso === todayIso;
            return (
              <div
                key={i}
                className={`min-h-[48px] sm:min-h-[92px] rounded-md sm:rounded-lg border p-0.5 sm:p-1.5 text-xs transition-colors ${
                  inMonth ? "border-white/8 bg-black/20" : "border-white/[0.03] bg-black/10 opacity-50"
                } ${today ? "ring-1 sm:ring-2 ring-teal-400 ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
              >
                <div className={`font-semibold w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full text-[9px] sm:text-[11px] ${
                  today ? "bg-teal-400 text-fixed-black" : "text-[var(--muted)]"
                }`}>
                  {d.getDate()}
                </div>
                <div className="hidden sm:block mt-1">
                  {items.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="truncate rounded px-1.5 py-0.5 mb-0.5 bg-teal-400/20 text-teal-300 text-[10px] flex items-center gap-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0" />
                      {m.name}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-[var(--muted)] pl-1">+{items.length - 3} till</div>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5">
                    {items.slice(0, 2).map((m) => (
                      <span key={m.id} className="h-1 w-1 rounded-full bg-teal-400 shrink-0" />
                    ))}
                    {items.length > 2 && <span className="h-1 w-1 rounded-full bg-teal-400/50 shrink-0" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  function shift(delta: number) {
    const next = new Date(cursor); next.setMonth(next.getMonth() + delta); setCursor(next);
  }
}

function firstOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function buildMonth(cursor: Date): Date[][] {
  const first = firstOfMonth(cursor);
  const start = new Date(first);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + w*7 + i); row.push(d);
    }
    weeks.push(row);
  }
  return weeks;
}

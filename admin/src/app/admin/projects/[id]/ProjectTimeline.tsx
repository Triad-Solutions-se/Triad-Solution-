import { fmtDate } from "@/lib/date";

export type TimelineTask = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  start: string; // ISO
  end: string | null; // ISO
  due_at: string | null; // ISO
};

const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-white/30",
  in_progress: "bg-amber-400",
  done: "bg-[var(--triad-teal)]",
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function ProjectTimeline({
  tasks,
  startDate,
  endDate,
}: {
  tasks: TimelineTask[];
  startDate?: string | null;
  endDate?: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-white/10 p-8 text-center text-xs text-[var(--muted)]">
        Inga uppgifter att visa i tidslinjen än.
      </div>
    );
  }

  // Compute overall date range across the project (use project start/end as
  // anchors when present so the chart always reflects the planned span).
  const dates: number[] = [];
  if (startDate) dates.push(new Date(startDate).getTime());
  if (endDate) dates.push(new Date(endDate).getTime());
  for (const t of tasks) {
    dates.push(new Date(t.start).getTime());
    if (t.end) dates.push(new Date(t.end).getTime());
    if (t.due_at) dates.push(new Date(t.due_at).getTime());
  }
  let min = Math.min(...dates);
  let max = Math.max(...dates);
  if (min === max) {
    min -= MS_DAY * 3;
    max += MS_DAY * 3;
  } else {
    const pad = (max - min) * 0.05;
    min -= pad;
    max += pad;
  }
  const range = max - min;
  const now = Date.now();
  const nowPct = now >= min && now <= max ? ((now - min) / range) * 100 : null;

  const ticks = generateTicks(min, max);

  return (
    <div className="overflow-x-auto scroll-x-hint -mx-2 px-2">
      {/*
       * One CSS grid drives the alignment: a fixed-width title column on the
       * left and a flexible track column on the right. The axis row, every
       * task row, and the today-marker all live in the same grid so ticks
       * line up with bar starts/ends down to the pixel.
       */}
      <div className="min-w-[700px] grid grid-cols-[180px_1fr] gap-x-3 relative">
        {/* Axis label cells */}
        <div />
        <div className="relative h-9 border-b border-white/10">
          {ticks.map((t, i) => {
            const left = ((t.timestamp - min) / range) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-end"
                style={{ left: `${left}%` }}
              >
                <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">
                  {t.label}
                </span>
                <span className="mt-1 h-2 w-px bg-white/15" />
              </div>
            );
          })}
        </div>

        {/* Bar rows */}
        {tasks.map((t) => {
          const startTs = new Date(t.start).getTime();
          const endTs = t.end
            ? new Date(t.end).getTime()
            : t.due_at
            ? new Date(t.due_at).getTime()
            : null;
          const isMilestone = endTs == null;
          const lo = Math.min(startTs, endTs ?? startTs);
          const hi = Math.max(startTs, endTs ?? startTs);
          const left = ((lo - min) / range) * 100;
          const width = isMilestone ? 0 : Math.max(((hi - lo) / range) * 100, 0.6);

          const overdue =
            t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < now;
          const barColor = overdue ? "bg-rose-400" : STATUS_COLOR[t.status] ?? "bg-white/30";

          // For narrow bars there isn't room for both labels — hide both
          // when the bar is tiny, show only the start when it's medium.
          const showBothLabels = width >= 18;
          const showStartOnly = !showBothLabels && width >= 9;

          return (
            <div key={t.id} className="contents">
              <div
                className="text-xs py-1.5 truncate self-center"
                title={t.title}
              >
                {t.title}
              </div>
              <div className="relative h-8 self-center">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.04]" />

                {/* Faint grid ticks aligned with axis */}
                {ticks.map((tk, i) => {
                  const tl = ((tk.timestamp - min) / range) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-white/[0.04]"
                      style={{ left: `${tl}%` }}
                    />
                  );
                })}

                {isMilestone ? (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full ring-2 ring-black/40 ${barColor}`}
                    style={{ left: `calc(${left}% - 6px)` }}
                    title={fmtDate(startTs)}
                  />
                ) : (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center justify-between gap-2 px-2 overflow-hidden ${barColor}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${fmtDate(startTs)} → ${fmtDate(endTs!)}`}
                  >
                    {showBothLabels && (
                      <>
                        <span className="text-[10px] font-medium text-black/80 whitespace-nowrap">
                          {fmtDate(startTs)}
                        </span>
                        <span className="text-[10px] font-medium text-black/80 whitespace-nowrap">
                          {fmtDate(endTs!)}
                        </span>
                      </>
                    )}
                    {showStartOnly && (
                      <span className="text-[10px] font-medium text-black/80 whitespace-nowrap">
                        {fmtDate(startTs)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Today marker — single absolute line spanning every grid row that
            sits inside the track column (column 2 starts at 180px + 12px gap). */}
        {nowPct != null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-400/60"
            style={{ left: `calc(180px + 0.75rem + (100% - 180px - 0.75rem) * ${nowPct} / 100)` }}
            aria-label="Idag"
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-white/5 text-[11px] text-[var(--muted)]">
        <Legend color="bg-white/30" label="Ej startad" />
        <Legend color="bg-amber-400" label="Pågår" />
        <Legend color="bg-[var(--triad-teal)]" label="Klar" />
        <Legend color="bg-rose-400" label="Försenad" />
        {nowPct != null && <Legend color="bg-rose-400/60" label="Idag" line />}
      </div>
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${line ? "h-3 w-px" : "h-2 w-3 rounded-sm"} ${color}`} />
      {label}
    </span>
  );
}


/**
 * Pick reasonable date ticks for the visible range. Granularity adapts so we
 * roughly aim for 5–8 ticks across the chart:
 *   < 30 days  → daily ticks every few days
 *   < 4 months → weekly ticks (Mondays)
 *   < 2 years  → monthly ticks (1st of month)
 *   else       → quarterly ticks
 */
function generateTicks(min: number, max: number): { timestamp: number; label: string }[] {
  const days = (max - min) / MS_DAY;
  const out: { timestamp: number; label: string }[] = [];

  if (days < 30) {
    const step = Math.max(1, Math.ceil(days / 7));
    const cursor = startOfDay(new Date(min));
    while (cursor.getTime() <= max) {
      if (cursor.getTime() >= min) {
        out.push({ timestamp: cursor.getTime(), label: fmtDate(cursor) });
      }
      cursor.setDate(cursor.getDate() + step);
    }
  } else if (days < 120) {
    const cursor = mondayOf(new Date(min));
    const step = days < 60 ? 1 : 2; // every week or every other week
    while (cursor.getTime() <= max) {
      if (cursor.getTime() >= min) {
        out.push({ timestamp: cursor.getTime(), label: fmtDate(cursor) });
      }
      cursor.setDate(cursor.getDate() + 7 * step);
    }
  } else if (days < 365 * 2) {
    const cursor = firstOfMonth(new Date(min));
    const step = days < 240 ? 1 : 2;
    while (cursor.getTime() <= max) {
      if (cursor.getTime() >= min) {
        out.push({ timestamp: cursor.getTime(), label: fmtDate(cursor) });
      }
      cursor.setMonth(cursor.getMonth() + step);
    }
  } else {
    const cursor = firstOfQuarter(new Date(min));
    while (cursor.getTime() <= max) {
      if (cursor.getTime() >= min) {
        out.push({
          timestamp: cursor.getTime(),
          label:
            "Q" + (Math.floor(cursor.getMonth() / 3) + 1) + " " + String(cursor.getFullYear()).slice(2),
        });
      }
      cursor.setMonth(cursor.getMonth() + 3);
    }
  }

  // Cap to at most 10 ticks so we don't crowd the axis.
  if (out.length > 10) {
    const skip = Math.ceil(out.length / 8);
    return out.filter((_, i) => i % skip === 0);
  }
  return out;
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function mondayOf(d: Date) {
  const c = startOfDay(d);
  const wd = c.getDay() || 7; // Sunday → 7
  c.setDate(c.getDate() - (wd - 1));
  return c;
}
function firstOfMonth(d: Date) {
  const c = startOfDay(d);
  c.setDate(1);
  return c;
}
function firstOfQuarter(d: Date) {
  const c = firstOfMonth(d);
  c.setMonth(Math.floor(c.getMonth() / 3) * 3);
  return c;
}

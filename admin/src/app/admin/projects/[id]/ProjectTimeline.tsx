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

  // Compute the date range across the project. Use project start/end as anchors
  // when present so the chart always reflects the planned span.
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
    min = min - MS_DAY * 3;
    max = max + MS_DAY * 3;
  } else {
    const pad = (max - min) * 0.05;
    min -= pad;
    max += pad;
  }

  const range = max - min;
  const now = Date.now();
  const nowPct = now >= min && now <= max ? ((now - min) / range) * 100 : null;

  const months = generateMonths(min, max);

  return (
    <div className="overflow-x-auto scroll-x-hint -mx-2 px-2">
      <div className="min-w-[640px] space-y-3">
        {/* Axis */}
        <div className="relative h-7 border-b border-white/10">
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/5" />
          {months.map((m) => {
            const left = ((m.timestamp - min) / range) * 100;
            return (
              <div
                key={m.timestamp}
                className="absolute top-0 -translate-x-1/2 text-[10px] text-[var(--muted)] uppercase tracking-wider"
                style={{ left: `${left}%` }}
              >
                <span className="absolute left-1/2 top-4 h-2 w-px -translate-x-1/2 bg-white/10" />
                {m.label}
              </div>
            );
          })}
          {nowPct != null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-rose-400/60"
              style={{ left: `${nowPct}%` }}
              aria-label="Idag"
            />
          )}
        </div>

        {/* Bars */}
        <ul className="space-y-2">
          {tasks.map((t) => {
            const start = new Date(t.start).getTime();
            const end = t.end
              ? new Date(t.end).getTime()
              : t.due_at
              ? new Date(t.due_at).getTime()
              : start + MS_DAY;
            const lo = Math.min(start, end);
            const hi = Math.max(start, end);
            const left = ((lo - min) / range) * 100;
            const width = Math.max(((hi - lo) / range) * 100, 1.2);

            const overdue =
              t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < now;
            const barColor = overdue ? "bg-rose-400" : STATUS_COLOR[t.status] ?? "bg-white/30";
            const isMilestone = !t.end && !t.due_at;

            return (
              <li key={t.id} className="grid grid-cols-[180px_1fr] gap-3 items-center">
                <div className="text-xs truncate" title={t.title}>
                  {t.title}
                </div>
                <div className="relative h-5 rounded bg-white/[0.03]">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-3 rounded-sm ${barColor} ${
                      isMilestone ? "w-2 rounded-full" : ""
                    }`}
                    style={{
                      left: `${left}%`,
                      width: isMilestone ? "8px" : `${width}%`,
                    }}
                    title={`${fmt(start)} → ${fmt(end)}`}
                  />
                  {nowPct != null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-rose-400/40"
                      style={{ left: `${nowPct}%` }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-white/5 text-[11px] text-[var(--muted)]">
          <Legend color="bg-white/30" label="Ej startad" />
          <Legend color="bg-amber-400" label="Pågår" />
          <Legend color="bg-[var(--triad-teal)]" label="Klar" />
          <Legend color="bg-rose-400" label="Försenad" />
          {nowPct != null && <Legend color="bg-rose-400/60" label="Idag" line />}
        </div>
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

function fmt(t: number) {
  return new Date(t).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function generateMonths(min: number, max: number) {
  const out: { timestamp: number; label: string }[] = [];
  const start = new Date(min);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const cursor = new Date(start);
  while (cursor.getTime() <= max) {
    if (cursor.getTime() >= min) {
      out.push({
        timestamp: cursor.getTime(),
        label: cursor.toLocaleDateString("sv-SE", { month: "short" }),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  // If too many months, downsample to ~6 labels.
  if (out.length > 6) {
    const step = Math.ceil(out.length / 6);
    return out.filter((_, i) => i % step === 0);
  }
  return out;
}

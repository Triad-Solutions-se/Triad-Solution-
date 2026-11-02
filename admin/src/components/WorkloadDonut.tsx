export type WorkloadSegment = { label: string; value: number };

const COLORS = [
  "#2dd4bf", // teal
  "#a78bfa", // purple
  "#fbbf24", // amber
  "#34d399", // emerald
  "#60a5fa", // blue
  "#f472b6", // pink
  "#fb923c", // orange
  "#f87171", // rose
];

export function WorkloadDonut({ segments }: { segments: WorkloadSegment[] }) {
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="rounded-card border border-dashed border-white/10 p-8 text-center text-xs text-[var(--muted)]">
        Inga öppna uppgifter att fördela.
      </div>
    );
  }

  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-white/5"
            strokeWidth={stroke}
          />
          {data.map((s, i) => {
            const len = (s.value / total) * circumference;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-bold leading-none">{total}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
            uppgifter
          </span>
        </div>
      </div>

      <ul className="flex-1 min-w-0 w-full space-y-1.5">
        {data.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="truncate flex-1 min-w-0">{s.label}</span>
              <span className="text-[var(--muted)] tabular-nums shrink-0">
                {s.value} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

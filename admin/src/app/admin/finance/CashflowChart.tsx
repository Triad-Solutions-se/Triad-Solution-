type Tx = { date: string | null; amount_sek: number | string | null };

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const MONTH_LABELS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function bucketKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(d: Date, withYear: boolean) {
  return withYear ? `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MONTH_LABELS[d.getMonth()];
}

export function CashflowChart({
  income,
  expenses,
  months = 12,
}: {
  income: Tx[];
  expenses: Tx[];
  months?: number;
}) {
  const now = new Date();
  const buckets: { key: string; label: string; date: Date; income: number; expense: number; net: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const includeYear = i === months - 1 || d.getMonth() === 0;
    buckets.push({
      key: bucketKey(d),
      label: bucketLabel(d, includeYear),
      date: d,
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));

  for (const r of income) {
    if (!r.date) continue;
    const d = new Date(r.date);
    const i = idx.get(bucketKey(d));
    if (i == null) continue;
    buckets[i].income += Number(r.amount_sek || 0);
  }
  for (const r of expenses) {
    if (!r.date) continue;
    const d = new Date(r.date);
    const i = idx.get(bucketKey(d));
    if (i == null) continue;
    buckets[i].expense += Number(r.amount_sek || 0);
  }
  for (const b of buckets) b.net = b.income - b.expense;

  const totalIn = buckets.reduce((s, b) => s + b.income, 0);
  const totalOut = buckets.reduce((s, b) => s + b.expense, 0);
  const totalNet = totalIn - totalOut;

  // Chart geometry
  const W = 720;
  const H = 220;
  const padL = 16;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxAbs = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.income, b.expense, Math.abs(b.net))),
  );
  const slot = innerW / buckets.length;
  const barW = Math.max(4, Math.min(18, slot * 0.32));
  const groupGap = 2;
  const yZero = padT + innerH / 2;
  // Scale for income/expense (always >= 0) and net (signed)
  const scalePos = innerH / 2 / maxAbs;

  function yFor(value: number) {
    return yZero - value * scalePos;
  }

  // Net line
  const netPath = buckets
    .map((b, i) => {
      const cx = padL + slot * (i + 0.5);
      const y = yFor(b.net);
      return `${i === 0 ? "M" : "L"} ${cx.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Cashflow senaste {months} mån</div>
          <div className="font-heading text-2xl font-bold mt-1">
            <span className={totalNet >= 0 ? "text-emerald-300" : "text-rose-300"}>{SEK(totalNet)}</span>
            <span className="text-sm font-normal text-[var(--muted)] ml-2">netto</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-2 text-[var(--muted)]">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" /> Intäkter
            <span className="font-mono text-emerald-300 ml-1">{SEK(totalIn)}</span>
          </span>
          <span className="flex items-center gap-2 text-[var(--muted)]">
            <span className="inline-block w-3 h-3 rounded-sm bg-rose-400" /> Utlägg
            <span className="font-mono text-rose-300 ml-1">{SEK(totalOut)}</span>
          </span>
          <span className="flex items-center gap-2 text-[var(--muted)]">
            <span className="inline-block w-3 h-1 rounded-full bg-sky-300" /> Netto
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto scroll-x-hint">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-[220px] min-w-[640px]"
        >
          {/* zero line */}
          <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {/* bars */}
          {buckets.map((b, i) => {
            const cx = padL + slot * (i + 0.5);
            const incY = yFor(b.income);
            const expY = yFor(-b.expense); // negative -> below zero
            const incH = yZero - incY;
            const expH = expY - yZero;
            return (
              <g key={b.key}>
                <rect
                  x={cx - barW - groupGap / 2}
                  y={incY}
                  width={barW}
                  height={Math.max(0, incH)}
                  rx="2"
                  fill="rgb(52 211 153 / 0.75)"
                />
                <rect
                  x={cx + groupGap / 2}
                  y={yZero}
                  width={barW}
                  height={Math.max(0, expH)}
                  rx="2"
                  fill="rgb(251 113 133 / 0.75)"
                />
                <text
                  x={cx}
                  y={H - padB + 16}
                  fontSize="10"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.55)"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
          {/* net line */}
          <path d={netPath} fill="none" stroke="rgb(125 211 252)" strokeWidth="2" />
          {buckets.map((b, i) => {
            const cx = padL + slot * (i + 0.5);
            const y = yFor(b.net);
            return <circle key={b.key + "-d"} cx={cx} cy={y} r="2.5" fill="rgb(125 211 252)" />;
          })}
        </svg>
      </div>
    </div>
  );
}

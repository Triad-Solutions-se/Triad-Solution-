// Byggblock för Ekonomi-sidan och kundsidan under Ekonomi: nyckeltal,
// grupprubrik och sektionsram med rubrikrad.

const financeColorMap = {
  green: { accentBar: "bg-emerald-400", numColor: "text-emerald-300" },
  red: { accentBar: "bg-rose-400", numColor: "text-rose-300" },
  teal: { accentBar: "bg-teal-400", numColor: "text-teal-300" },
  blue: { accentBar: "bg-sky-400", numColor: "text-sky-300" },
  amber: { accentBar: "bg-amber-400", numColor: "text-amber-300" },
};

export function FinanceStat({
  label,
  value,
  color,
  hint,
  note,
}: {
  label: string;
  value: string;
  color: keyof typeof financeColorMap;
  // Vad siffran räknar, på en rad under beloppet.
  hint?: string;
  // Något som behöver göras (förfallna fakturor, planer utan faktura).
  note?: { text: string; tone: "red" | "amber" };
}) {
  const c = financeColorMap[color];
  return (
    <div className="glass rounded-xl border border-white/10 p-5 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.accentBar}`} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className={`font-heading text-xl sm:text-2xl font-bold mt-2 ${c.numColor}`}>{value}</div>
        {hint && <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>}
        {note && (
          <div className={`text-xs mt-0.5 ${note.tone === "red" ? "text-rose-300" : "text-amber-300"}`}>
            {note.text}
          </div>
        )}
      </div>
    </div>
  );
}

export function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mt-10 mb-3">
      {children}
    </h2>
  );
}

export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl border border-white/10 overflow-hidden mb-6">
      <header className="px-5 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold">{title}</h2>
          {hint && <p className="text-xs text-[var(--muted)] mt-0.5">{hint}</p>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </header>
      <div className="overflow-x-auto scroll-x-hint">{children}</div>
    </section>
  );
}

// Redovisningsperioder för moms och räkenskapsår. Ren fil.
//
// Sista dag enligt Skatteverket ("När ska jag deklarera moms?"):
//   - Kvartal och månad (högst 40 mkr): den 12:e i andra månaden efter perioden,
//     den 17:e i augusti, och för månad även i januari.
//   - Helår: beror på bolagsform, EU-handel och digital/papper, så datumet räknas
//     inte fram här. Vi hänvisar till Skatteverket.
// Infaller dagen på en helg används närmaste måndag. Helgdagar räknas inte in.

export type VatPeriodType = "monthly" | "quarterly" | "yearly";

export type VatPeriod = {
  id: string;
  label: string;
  from: string;
  to: string;
  due: string | null;
};

export type FiscalYear = {
  id: string;
  start_date: string;
  end_date: string;
  closed_at: string | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function rollWeekend(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Sista dag att deklarera och betala för en period som slutar `to`. */
export function vatDueDate(type: VatPeriodType, to: string): string | null {
  if (type === "yearly") return null;
  const [y, m] = to.split("-").map(Number);
  const dueMonth = ((m + 2 - 1) % 12) + 1;
  const dueYear = y + (m + 2 > 12 ? 1 : 0);
  const late = dueMonth === 8 || (type === "monthly" && dueMonth === 1);
  return rollWeekend(iso(dueYear, dueMonth, late ? 17 : 12));
}

/** Perioderna från bokföringsstarten till och med den period dagens datum ligger i. */
export function vatPeriods(
  type: VatPeriodType,
  startDate: string,
  today: string,
  fiscalYears: FiscalYear[] = [],
): VatPeriod[] {
  const out: VatPeriod[] = [];
  if (type === "yearly") {
    for (const fy of [...fiscalYears].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      if (fy.end_date < startDate || fy.start_date > today) continue;
      out.push({
        id: `${fy.start_date.slice(0, 4)}-Y`,
        label: `Helår ${fy.start_date} – ${fy.end_date}`,
        from: fy.start_date,
        to: fy.end_date,
        due: null,
      });
    }
    return out;
  }
  const [sy, sm] = startDate.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  if (type === "monthly") {
    for (let y = sy, m = sm; y < ty || (y === ty && m <= tm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      const to = iso(y, m, lastDay(y, m));
      out.push({
        id: `${y}-${pad(m)}`,
        label: `${MONTHS[m - 1]} ${y}`,
        from: iso(y, m, 1),
        to,
        due: vatDueDate(type, to),
      });
    }
    return out;
  }
  const quarterOf = (m: number) => Math.floor((m - 1) / 3) + 1;
  for (let y = sy, q = quarterOf(sm); y < ty || (y === ty && q <= quarterOf(tm)); q === 4 ? ((y += 1), (q = 1)) : (q += 1)) {
    const firstMonth = (q - 1) * 3 + 1;
    const to = iso(y, firstMonth + 2, lastDay(y, firstMonth + 2));
    out.push({
      id: `${y}-Q${q}`,
      label: `${MONTHS[firstMonth - 1]}–${MONTHS[firstMonth + 1]} ${y}`,
      from: iso(y, firstMonth, 1),
      to,
      due: vatDueDate(type, to),
    });
  }
  return out;
}

/** Räkenskapsåret som ett datum ligger i. */
export function fiscalYearFor(years: FiscalYear[], date: string): FiscalYear | null {
  return years.find((y) => date >= y.start_date && date <= y.end_date) ?? null;
}

export function fiscalYearLabel(y: Pick<FiscalYear, "start_date" | "end_date">): string {
  const a = y.start_date.slice(0, 4);
  const b = y.end_date.slice(0, 4);
  return a === b && y.start_date.endsWith("-01-01") && y.end_date.endsWith("-12-31") ? a : `${y.start_date} – ${y.end_date}`;
}

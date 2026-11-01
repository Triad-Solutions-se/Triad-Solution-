// Återkommande intäkter och fakturering — delad logik för Ekonomi, avtal,
// offerter och genereringen av fakturautkast. Ren fil (inga server-beroenden)
// så den kan importeras överallt.
//
// En plan (public.recurring_income, migration 0030 + 0036) har ett ankare
// (start_date) och en frekvens. Period k börjar på ankaret + k × frekvensen,
// förankrat i ankarets dag i månaden (31:a klampas till månadens sista dag så
// serien inte driftar), och slutar dagen före nästa periods start.
//
// Planer med create_invoices skapar ett fakturautkast per period. Markören
// next_due_date är starten på nästa period som ska faktureras; förskott
// skapar utkastet lead_days före periodstart, efterskott dagen efter
// periodslut.

import { type OfferItem } from "./offer-items";
import {
  type InvoiceLine,
  addDaysISO,
  computeInvoiceTotals,
  linesFromOfferItems,
  normalizeLines,
} from "./invoice";

export type Frequency = "monthly" | "quarterly" | "semiannual" | "yearly";
export type BillingTiming = "advance" | "arrears";

export const FREQUENCIES: {
  value: Frequency;
  label: string;   // "Kvartalsvis"
  adverb: string;  // "kvartalsvis" — "faktureras kvartalsvis"
  per: string;     // "kvartal" — "1 250 kr/kvartal"
  months: number;
}[] = [
  { value: "monthly", label: "Månadsvis", adverb: "månadsvis", per: "mån", months: 1 },
  { value: "quarterly", label: "Kvartalsvis", adverb: "kvartalsvis", per: "kvartal", months: 3 },
  { value: "semiannual", label: "Halvårsvis", adverb: "halvårsvis", per: "halvår", months: 6 },
  { value: "yearly", label: "Årsvis", adverb: "årsvis", per: "år", months: 12 },
];

export const BILLING_TIMINGS: { value: BillingTiming; label: string }[] = [
  { value: "advance", label: "Förskott" },
  { value: "arrears", label: "Efterskott" },
];

export function isFrequency(v: unknown): v is Frequency {
  return FREQUENCIES.some((f) => f.value === v);
}

export function frequencyInfo(v: string | null | undefined) {
  return FREQUENCIES.find((f) => f.value === v) ?? FREQUENCIES[0];
}

export function monthsPer(v: string | null | undefined): number {
  return frequencyInfo(v).months;
}

// Belopp per period omräknat till per månad (för MRR-summeringar).
export function toMonthly(amount: number | string | null | undefined, freq: string | null | undefined): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n / monthsPer(freq) : 0;
}

// "Återkommande kostnad faktureras kvartalsvis" — används i offert-PDF/Excel.
export function billingPhrase(freq: string | null | undefined): string {
  return `faktureras ${frequencyInfo(freq).adverb}`;
}

// ---------- Perioder ----------

export type Period = { start: string; end: string };

// k:te periodstarten räknat från ankaret.
export function occurrenceISO(anchor: string, months: number, k: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const total = m - 1 + k * months;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function periodAt(anchor: string, freq: string | null | undefined, k: number): Period {
  const months = monthsPer(freq);
  return {
    start: occurrenceISO(anchor, months, k),
    end: addDaysISO(occurrenceISO(anchor, months, k + 1), -1),
  };
}

// Index för första perioden som börjar på eller efter `date`.
export function periodIndexFrom(anchor: string, freq: string | null | undefined, date: string): number {
  const months = monthsPer(freq);
  for (let k = 0; k < 1200; k++) {
    if (occurrenceISO(anchor, months, k) >= date) return k;
  }
  return 1200;
}

// Dagen då periodens fakturautkast ska skapas.
export function invoiceDateFor(period: Period, timing: string | null | undefined, leadDays: number | null | undefined): string {
  if (timing === "arrears") return addDaysISO(period.end, 1);
  return addDaysISO(period.start, -Math.max(0, Number(leadDays) || 0));
}

// ---------- Planer ----------

export type RecurringPlan = {
  id: string;
  description: string;
  amount_sek: number | string;
  source: string | null;
  customer_id: string | null;
  project_id: string | null;
  bank_account_id: string | null;
  frequency: string;
  next_due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  // Migration 0036 — saknas tills den körts.
  agreement_id?: string | null;
  offer_id?: string | null;
  create_invoices?: boolean | null;
  items?: unknown;
  vat_rate?: number | string | null;
  currency?: string | null;
  payment_terms_days?: number | null;
  billing_timing?: string | null;
  lead_days?: number | null;
  invoice_message?: string | null;
  our_reference?: string | null;
};

export type NextInvoice = { index: number; period: Period; invoiceDate: string };

// Nästa period att fakturera för en plan som skapar fakturor, eller null om
// planen saknar startdatum eller har passerat sitt slutdatum.
export function nextInvoicePeriod(plan: RecurringPlan): NextInvoice | null {
  const anchor = plan.start_date ?? plan.next_due_date;
  if (!anchor) return null;
  const k = periodIndexFrom(anchor, plan.frequency, plan.next_due_date ?? anchor);
  const period = periodAt(anchor, plan.frequency, k);
  if (plan.end_date && period.start > plan.end_date) return null;
  return { index: k, period, invoiceDate: invoiceDateFor(period, plan.billing_timing, plan.lead_days) };
}

export function planLines(plan: Pick<RecurringPlan, "items">): InvoiceLine[] {
  return normalizeLines(plan.items);
}

export function planTotals(plan: Pick<RecurringPlan, "items" | "vat_rate" | "currency">) {
  return computeInvoiceTotals(planLines(plan), plan.vat_rate ?? 25, plan.currency ?? "SEK");
}

// Offertens återkommande rader som fakturarader för en period: priset är per
// månad, så antalet blir periodens längd i månader.
export function linesForPeriod(monthlyItems: OfferItem[], freq: string | null | undefined): InvoiceLine[] {
  return linesFromOfferItems(monthlyItems, monthsPer(freq), "mån");
}

// När frekvensen ändras följer månadsrader med: 1 mån → 3 mån osv. Rader som
// redigerats till något annat lämnas orörda.
export function rescaleLines(lines: InvoiceLine[], from: string, to: string): InvoiceLine[] {
  const a = monthsPer(from);
  const b = monthsPer(to);
  if (a === b) return lines;
  return lines.map((l) => (l.unit === "mån" && l.quantity === a ? { ...l, quantity: b } : l));
}

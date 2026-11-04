// Kunder — delad logik för kundlistan, Ekonomi-sidans intäkter per kund och
// kundsidan under Ekonomi: status och ekonomisk sammanställning per kund.
// Ren fil (inga server-beroenden) så den kan importeras överallt.

import { effectiveStatus, isOutstanding, todayISO } from "./invoice";
import { toMonthly } from "./recurring";

type Tone = "green" | "blue" | "gray" | "red";

const CUSTOMER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Aktiv", tone: "green" },
  prospect: { label: "Prospekt", tone: "blue" },
  inactive: { label: "Inaktiv", tone: "gray" },
  closed: { label: "Avslutad", tone: "red" },
};

export function customerStatus(s: string | null | undefined): { label: string; tone: Tone } {
  return (s && CUSTOMER_STATUS[s]) || { label: s ?? "—", tone: "gray" };
}

// ---------- Ekonomi per kund ----------

// Kundsidan under Ekonomi: kunduppgifter, planer, fakturor och intäkter.
export function customerEconomyHref(id: string): string {
  return `/admin/finance/customers/${id}`;
}

type Amount = number | string | null | undefined;
type IncomeRow = { customer_id: string | null; amount_sek: Amount; status: string | null; date: string | null };
type InvoiceRow = {
  customer_id: string | null;
  status: string | null;
  due_date: string | null;
  amount_sek: Amount;
  credited_invoice_id?: string | null;
};
type PlanRow = { customer_id: string | null; amount_sek: Amount; frequency: string | null; active: boolean | null };

export type CustomerEconomy = {
  monthly: number; // aktiva återkommande planer omräknat till per månad
  activePlans: number;
  receivedYear: number; // mottagna intäkter i år — betalda fakturor ingår (0036)
  receivedTotal: number;
  lastReceived: string | null;
  pending: number; // intäkter som ingen har bekräftat som mottagna
  pendingCount: number;
  outstanding: number; // skickade fakturor som inte är betalda
  outstandingCount: number;
  overdue: number; // varav förfallna
  overdueCount: number;
  invoiceCount: number; // debetfakturor, kreditfakturor räknas inte
};

export function emptyEconomy(): CustomerEconomy {
  return {
    monthly: 0,
    activePlans: 0,
    receivedYear: 0,
    receivedTotal: 0,
    lastReceived: null,
    pending: 0,
    pendingCount: 0,
    outstanding: 0,
    outstandingCount: 0,
    overdue: 0,
    overdueCount: 0,
    invoiceCount: 0,
  };
}

// Pengar som kunden har kvar att betala: obekräftade intäkter + obetalda
// fakturor (fakturor får en intäktsrad först när de betalas, så inget räknas två gånger).
export function toReceive(e: CustomerEconomy): number {
  return e.pending + e.outstanding;
}

// Summerar intäkter, fakturor och planer per kund. Nyckeln null samlar det
// som saknar kund. Bara kunder med minst en rad finns med i resultatet.
export function economyByCustomer(
  { income, invoices, plans }: { income: IncomeRow[]; invoices: InvoiceRow[]; plans: PlanRow[] },
  today: string = todayISO(),
): Map<string | null, CustomerEconomy> {
  const year = today.slice(0, 4);
  const byCustomer = new Map<string | null, CustomerEconomy>();
  const get = (id: string | null) => {
    let e = byCustomer.get(id);
    if (!e) byCustomer.set(id, (e = emptyEconomy()));
    return e;
  };
  for (const r of income) {
    const e = get(r.customer_id);
    const amount = Number(r.amount_sek || 0);
    if (r.status === "received") {
      e.receivedTotal += amount;
      if (String(r.date ?? "").startsWith(year)) e.receivedYear += amount;
      if (r.date && (!e.lastReceived || r.date > e.lastReceived)) e.lastReceived = r.date;
    } else {
      e.pending += amount;
      e.pendingCount += 1;
    }
  }
  for (const r of invoices) {
    const e = get(r.customer_id);
    if (r.credited_invoice_id) continue;
    e.invoiceCount += 1;
    if (!isOutstanding(r)) continue;
    const amount = Number(r.amount_sek || 0);
    e.outstanding += amount;
    e.outstandingCount += 1;
    if (effectiveStatus(r, today) === "overdue") {
      e.overdue += amount;
      e.overdueCount += 1;
    }
  }
  for (const r of plans) {
    const e = get(r.customer_id);
    if (!r.active) continue;
    e.activePlans += 1;
    e.monthly += toMonthly(r.amount_sek, r.frequency);
  }
  return byCustomer;
}

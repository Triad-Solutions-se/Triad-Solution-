// Materialisering av återkommande intäkter (migration 0030/0031/0036):
//   - planer utan create_invoices skapar income-rader per förfallodatum
//     (oförändrat beteende från 0031),
//   - planer med create_invoices skapar fakturautkast per period.
// Körs vid sidladdning av Ekonomi, Fakturor, offert- och avtalssidan, och
// från "Fakturera nu" i planformuläret. Tar en vanlig SupabaseClient så den
// fungerar både på servern och i klienten. Saknas en migration hoppas den
// delen över tyst så sidorna alltid renderar.

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, newLineId, todayISO } from "./invoice";
import {
  type Period,
  type RecurringPlan,
  monthsPer,
  nextInvoicePeriod,
  occurrenceISO,
  periodAt,
  planLines,
  planTotals,
} from "./recurring";

// Skydd mot att en plan med startdatum långt bak skapar hundratals utkast i
// en enda sidladdning. Resten kommer vid nästa laddning.
const MAX_INVOICES_PER_PLAN = 24;

type CustomerSnapshot = {
  id: string;
  name: string;
  org_number: string | null;
  address: string | null;
  contact_person: string | null;
};

export async function materializeRecurring(supabase: SupabaseClient): Promise<{ invoicesCreated: number }> {
  const { data, error } = await supabase.from("recurring_income").select("*").eq("active", true);
  if (error || !data?.length) return { invoicesCreated: 0 };
  const plans = data as RecurringPlan[];
  const today = todayISO();
  await materializeIncome(supabase, plans.filter((p) => !p.create_invoices), today);
  const invoicePlans = plans.filter((p) => p.create_invoices);
  if (!invoicePlans.length) return { invoicesCreated: 0 };
  return { invoicesCreated: await createDueInvoices(supabase, invoicePlans, today) };
}

// Skapar income-rader för alla passerade förfallodatum och flyttar fram
// next_due_date till nästa framtida datum. Idempotent via unikt index
// (recurring_income_id, date).
async function materializeIncome(supabase: SupabaseClient, plans: RecurringPlan[], today: string) {
  for (const r of plans) {
    const anchor = r.start_date ?? r.next_due_date;
    if (!anchor || anchor > today) continue;
    const months = monthsPer(r.frequency);

    const due: string[] = [];
    let nextDue: string | null = null;
    for (let k = 0; k < 620; k++) {
      const d = occurrenceISO(anchor, months, k);
      if (r.end_date && d > r.end_date) break;
      if (d > today) {
        nextDue = d;
        break;
      }
      due.push(d);
    }

    if (due.length) {
      const { error } = await supabase.from("income").upsert(
        due.map((date) => ({
          description: r.description,
          amount_sek: r.amount_sek,
          source: r.source,
          customer_id: r.customer_id,
          project_id: r.project_id,
          bank_account_id: r.bank_account_id,
          date,
          status: "pending",
          recurring_income_id: r.id,
        })),
        { onConflict: "recurring_income_id,date", ignoreDuplicates: true },
      );
      if (error) continue;
    }
    if (nextDue !== (r.next_due_date ?? null)) {
      await supabase.from("recurring_income").update({ next_due_date: nextDue }).eq("id", r.id);
    }
  }
}

async function fetchContext(supabase: SupabaseClient, customerIds: string[]) {
  const [customers, settings] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id,name,org_number,address,contact_person").in("id", customerIds)
      : Promise.resolve({ data: [] as CustomerSnapshot[] }),
    supabase.from("company_settings").select("payment_terms_days").eq("id", 1).maybeSingle(),
  ]);
  const terms = Number(settings.data?.payment_terms_days);
  return {
    customers: new Map(((customers.data ?? []) as CustomerSnapshot[]).map((c) => [c.id, c])),
    defaultTerms: Number.isFinite(terms) && terms >= 0 ? terms : 30,
  };
}

// Fakturautkastet för en period. Kunduppgifterna kopieras in (som när en
// faktura skapas för hand) så att fakturan inte ändras om kunden redigeras.
function invoiceRow(
  plan: RecurringPlan,
  period: Period,
  customer: CustomerSnapshot,
  defaultTerms: number,
  today: string,
) {
  const items = planLines(plan).map((l) => ({ ...l, id: newLineId() }));
  const totals = planTotals(plan);
  const terms = plan.payment_terms_days ?? defaultTerms;
  return {
    status: "draft",
    customer_id: customer.id,
    customer_name: customer.name,
    customer_org_number: customer.org_number || null,
    customer_address: customer.address || null,
    reference: customer.contact_person || null,
    our_reference: plan.our_reference || null,
    issued_at: today,
    payment_terms_days: terms,
    due_date: addDaysISO(today, terms),
    period_start: period.start,
    period_end: plan.end_date && period.end > plan.end_date ? plan.end_date : period.end,
    items,
    vat_rate: plan.vat_rate ?? 25,
    currency: plan.currency ?? "SEK",
    net_amount: totals.net,
    vat_amount: totals.vat,
    amount_sek: totals.toPay,
    message: plan.invoice_message || null,
    notes: `Skapad automatiskt från återkommande fakturering: ${plan.description}.`,
    offer_id: plan.offer_id ?? null,
    agreement_id: plan.agreement_id ?? null,
    project_id: plan.project_id,
    bank_account_id: plan.bank_account_id,
    recurring_income_id: plan.id,
  };
}

// Upsert mot (recurring_income_id, period_start): körs två sidladdningar
// samtidigt blir det ändå bara ett utkast per period.
async function insertPeriodInvoice(supabase: SupabaseClient, row: ReturnType<typeof invoiceRow>) {
  return supabase
    .from("invoices")
    .upsert(row, { onConflict: "recurring_income_id,period_start", ignoreDuplicates: true })
    .select("id");
}

async function createDueInvoices(supabase: SupabaseClient, plans: RecurringPlan[], today: string): Promise<number> {
  const ctx = await fetchContext(supabase, [...new Set(plans.map((p) => p.customer_id).filter(Boolean) as string[])]);
  let created = 0;

  for (const plan of plans) {
    const customer = plan.customer_id ? ctx.customers.get(plan.customer_id) : undefined;
    if (!customer || planLines(plan).length === 0) continue;
    const anchor = plan.start_date ?? plan.next_due_date;
    if (!anchor) continue;

    let cursor = plan.next_due_date;
    for (let n = 0; n < MAX_INVOICES_PER_PLAN; n++) {
      const next = nextInvoicePeriod({ ...plan, next_due_date: cursor });
      if (!next) {
        // Slut på planen: markören pekar på första perioden efter slutdatum,
        // så serien fortsätter rätt om slutdatumet flyttas fram.
        cursor = periodAt(anchor, plan.frequency, periodIndexAfterEnd(plan, anchor)).start;
        break;
      }
      cursor = next.period.start;
      if (next.invoiceDate > today) break;
      const { data, error } = await insertPeriodInvoice(
        supabase,
        invoiceRow(plan, next.period, customer, ctx.defaultTerms, today),
      );
      if (error) break;
      created += data?.length ?? 0;
      cursor = periodAt(anchor, plan.frequency, next.index + 1).start;
    }

    if (cursor && cursor !== plan.next_due_date) {
      await supabase.from("recurring_income").update({ next_due_date: cursor }).eq("id", plan.id);
    }
  }
  return created;
}

function periodIndexAfterEnd(plan: RecurringPlan, anchor: string): number {
  const months = monthsPer(plan.frequency);
  let k = 0;
  while (k < 1200 && plan.end_date && occurrenceISO(anchor, months, k) <= plan.end_date) k++;
  return k;
}

// "Fakturera nu": skapar utkastet för nästa period direkt, oavsett när det
// annars skulle ha skapats, och flyttar fram markören. Returnerar fakturans id.
export async function invoiceNextPeriodNow(
  supabase: SupabaseClient,
  plan: RecurringPlan,
): Promise<{ invoiceId: string | null; error: string | null }> {
  const next = nextInvoicePeriod(plan);
  if (!next) return { invoiceId: null, error: "Planen har inga fler perioder att fakturera." };
  if (!plan.customer_id) return { invoiceId: null, error: "Planen saknar kund." };
  if (planLines(plan).length === 0) return { invoiceId: null, error: "Planen saknar fakturarader." };
  const ctx = await fetchContext(supabase, [plan.customer_id]);
  const customer = ctx.customers.get(plan.customer_id);
  if (!customer) return { invoiceId: null, error: "Kunden hittades inte." };

  const anchor = (plan.start_date ?? plan.next_due_date)!;
  const { data, error } = await insertPeriodInvoice(
    supabase,
    invoiceRow(plan, next.period, customer, ctx.defaultTerms, todayISO()),
  );
  if (error) return { invoiceId: null, error: error.message };

  await supabase
    .from("recurring_income")
    .update({ next_due_date: periodAt(anchor, plan.frequency, next.index + 1).start })
    .eq("id", plan.id);

  let invoiceId = data?.[0]?.id ?? null;
  if (!invoiceId) {
    // Perioden var redan fakturerad (t.ex. markören hade flyttats bakåt).
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("recurring_income_id", plan.id)
      .eq("period_start", next.period.start)
      .maybeSingle();
    invoiceId = existing?.id ?? null;
  }
  return { invoiceId, error: null };
}

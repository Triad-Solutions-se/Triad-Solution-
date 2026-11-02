// Automatiska fakturamejl för återkommande fakturering (migration 0036 + 0038).
// Körs dagligen av /api/cron/invoices: skapar först periodernas fakturautkast
// (materializeRecurring — samma som vid sidladdning) och mejlar sedan varje
// utkast från en aktiv plan med auto_send som aldrig har försökt skickas.
//
// Ett misslyckat utskick görs inte om automatiskt: felet hamnar på planen
// (last_error) och i fakturans utskickslogg, och fakturan skickas för hand när
// det är åtgärdat. Server-only (sendInvoiceEmail läser API-nyckeln).

import type { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurring } from "./recurring-data";
import { sendInvoiceEmail } from "./invoice-email";

export type AutoSendResult = {
  invoiceId: string;
  number: string;
  planId: string;
  ok: boolean;
  error?: string;
};

export async function runRecurringBilling(supabase: SupabaseClient): Promise<{
  invoicesCreated: number;
  results: AutoSendResult[];
  error?: string;
}> {
  const { invoicesCreated } = await materializeRecurring(supabase);

  const { data: plans, error } = await supabase
    .from("recurring_income")
    .select("id,email_to")
    .eq("create_invoices", true)
    .eq("auto_send", true)
    .eq("active", true);
  if (error) return { invoicesCreated, results: [], error: error.message };
  const planEmail = new Map((plans ?? []).map((p) => [p.id as string, (p.email_to as string | null) ?? null]));
  if (planEmail.size === 0) return { invoicesCreated, results: [] };

  const { data: drafts, error: draftsError } = await supabase
    .from("invoices")
    .select("id,number,recurring_income_id,email_to")
    .in("recurring_income_id", [...planEmail.keys()])
    .eq("status", "draft")
    .is("emailed_at", null)
    .order("number");
  if (draftsError) return { invoicesCreated, results: [], error: draftsError.message };

  const ids = (drafts ?? []).map((d) => d.id as string);
  const { data: attempts } = ids.length
    ? await supabase.from("invoice_email_log").select("invoice_id").in("invoice_id", ids)
    : { data: [] as { invoice_id: string }[] };
  const attempted = new Set((attempts ?? []).map((a) => a.invoice_id));

  const results: AutoSendResult[] = [];
  for (const d of drafts ?? []) {
    if (attempted.has(d.id)) continue;
    const planId = d.recurring_income_id as string;
    const sent = await sendInvoiceEmail(supabase, d.id, {
      to: d.email_to || planEmail.get(planId) || null,
      automatic: true,
      idempotencyKey: `invoice-${d.id}`,
    });
    if (!sent.ok) {
      await supabase
        .from("recurring_income")
        .update({ last_error: `Faktura ${d.number} skapades men mejlades inte: ${sent.error}` })
        .eq("id", planId);
    }
    results.push({
      invoiceId: d.id,
      number: d.number,
      planId,
      ok: sent.ok,
      ...(sent.ok ? {} : { error: sent.error }),
    });
  }
  return { invoicesCreated, results };
}

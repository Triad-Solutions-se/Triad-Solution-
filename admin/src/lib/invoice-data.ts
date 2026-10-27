// Server-hjälpare för fakturor: hämtar leverantörens fakturauppgifter och
// mappar en fakturarad till det format PDF-generatorn förväntar sig. Delas av
// PDF-routen och fakturasidorna så att urval och mappning hålls i synk.

import type { createClient } from "@/lib/supabase/server";
import {
  type InvoiceSettings,
  normalizeLines,
  toInvoiceSettings,
} from "./invoice";
import type { InvoicePdfData } from "./invoice-pdf";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Egen fråga (inte i fetchCompanyInfo) så att offert- och avtalsflödet fortsätter
// fungera även om migration 0034 inte körts. `error` sätts då och sidorna kan
// visa en hint om migrationen.
export async function fetchInvoiceSettings(
  supabase: SupabaseServerClient,
): Promise<{ settings: InvoiceSettings; error: string | null }> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("bankgiro,vat_number,registered_office,f_skatt,payment_terms_days,late_interest")
    .eq("id", 1)
    .maybeSingle();
  return { settings: toInvoiceSettings(data), error: error?.message ?? null };
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export async function fetchInvoiceForPdf(
  supabase: SupabaseServerClient,
  id: string,
): Promise<{ invoice: InvoicePdfData | null; customerName: string; error: string | null; status: number }> {
  const { data: row, error } = await supabase
    .from("invoices")
    .select("*, offer:offers(offer_number), agreement:agreements(agreement_number)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { invoice: null, customerName: "", error: error.message, status: 500 };
  if (!row) return { invoice: null, customerName: "", error: "Fakturan hittades inte", status: 404 };

  let creditedNumber: string | null = null;
  if (row.credited_invoice_id) {
    const { data: orig } = await supabase
      .from("invoices")
      .select("number")
      .eq("id", row.credited_invoice_id)
      .maybeSingle();
    creditedNumber = orig?.number ?? null;
  }

  const customerName = row.customer_name?.trim() || "";
  return {
    invoice: {
      number: row.number,
      ocr: row.ocr ?? null,
      isDraft: row.status === "draft",
      isCredit: !!row.credited_invoice_id,
      creditedNumber,
      issuedAt: row.issued_at ?? null,
      dueDate: row.due_date ?? null,
      paymentTermsDays: Number(row.payment_terms_days ?? 30),
      periodStart: row.period_start ?? null,
      periodEnd: row.period_end ?? null,
      reference: row.reference ?? null,
      ourReference: row.our_reference ?? null,
      customer: {
        name: customerName,
        orgNumber: row.customer_org_number ?? null,
        address: row.customer_address ?? null,
      },
      lines: normalizeLines(row.items),
      vatRate: Number(row.vat_rate ?? 25),
      currency: row.currency ?? "SEK",
      message: row.message ?? null,
      offerNumber: one<any>(row.offer)?.offer_number ?? null,
      agreementNumber: one<any>(row.agreement)?.agreement_number ?? null,
    },
    customerName,
    error: null,
    status: 200,
  };
}

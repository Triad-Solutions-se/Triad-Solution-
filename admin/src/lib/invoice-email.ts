// Skickar en faktura som PDF med e-post via Resend (https://resend.com).
// Används av "Skicka med e-post" i portalen och av återkommande fakturering
// (dagliga körningen i /api/cron/invoices).
// Server-only: läser API-nyckeln från miljön.
//
// Miljövariabler (Vercel → triad-admin → Settings → Environment Variables):
//   RESEND_API_KEY      API-nyckel från Resend (domänen mcasolutions.se verifierad där)
//   INVOICE_EMAIL_FROM  avsändare, t.ex. "MCA Solutions <faktura@mcasolutions.se>"
//   INVOICE_EMAIL_BCC   valfri — kopia av varje utskick, kommaseparerade adresser
//   RESEND_API_URL      valfri — annan bas-URL (t.ex. lokal testserver)
//
// Svaren går till företagets e-post under Inställningar (reply-to).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCompanyInfo } from "@/app/admin/api/offers/[id]/contract-data";
import { generateInvoicePdf } from "./invoice-pdf";
import { fetchInvoiceForPdf, fetchInvoiceSettings } from "./invoice-data";
import {
  fmtAmount,
  formatBankgiro,
  isValidEmail,
  missingForSend,
  normalizeLines,
} from "./invoice";

export function emailConfig(): { ready: boolean; missing: string[] } {
  const missing = ["RESEND_API_KEY", "INVOICE_EMAIL_FROM"].filter((k) => !process.env[k]?.trim());
  return { ready: missing.length === 0, missing };
}

export type SendResult = { ok: true; to: string } | { ok: false; error: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Skickar fakturan till `to` (eller fakturans/kundens e-post). Ett utkast
// kontrolleras och markeras som skickat först när mejlet har gått iväg, så
// att en misslyckad sändning aldrig låser fakturan. Varje försök loggas.
export async function sendInvoiceEmail(
  supabase: SupabaseClient,
  invoiceId: string,
  opts: { to?: string | null; automatic?: boolean; idempotencyKey?: string } = {},
): Promise<SendResult> {
  const { data: row, error: rowError } = await supabase
    .from("invoices")
    .select("*, customer:customers(email)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (rowError || !row) return { ok: false, error: rowError?.message ?? "Fakturan hittades inte." };

  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
  const to = (opts.to || row.email_to || customer?.email || "").trim();

  const log = async (status: "sent" | "failed", extra: { provider_id?: string; error?: string }) => {
    if (!to) return;
    await supabase.from("invoice_email_log").insert({
      invoice_id: invoiceId,
      to_email: to,
      status,
      automatic: !!opts.automatic,
      ...extra,
    });
  };
  const fail = async (error: string): Promise<SendResult> => {
    await log("failed", { error });
    return { ok: false, error };
  };

  if (!isValidEmail(to)) return fail(to ? `Ogiltig e-postadress: ${to}` : "Ingen e-postadress för fakturan.");
  const config = emailConfig();
  if (!config.ready) return fail(`E-post är inte konfigurerad (${config.missing.join(", ")} saknas).`);

  const [company, { settings }, pdf] = await Promise.all([
    fetchCompanyInfo(supabase),
    fetchInvoiceSettings(supabase),
    fetchInvoiceForPdf(supabase, invoiceId),
  ]);
  if (!pdf.invoice) return fail(pdf.error ?? "Kunde inte läsa fakturan.");
  const inv = pdf.invoice;

  if (row.status === "draft") {
    const missing = missingForSend(row, normalizeLines(row.items), company, settings);
    if (missing.length > 0) return fail(`Saknas innan fakturan kan skickas: ${missing.join(", ")}.`);
  }

  // Mejlet bär den slutliga fakturan, även när ett utkast skickas.
  const bytes = await generateInvoicePdf({ ...inv, isDraft: false }, company, settings);
  const kind = inv.isCredit ? "Kreditfaktura" : "Faktura";
  const amount = `${fmtAmount(row.amount_sek)} ${inv.currency}`;
  const bankgiro = formatBankgiro(settings.bankgiro);
  const subject = `${kind} ${inv.number} från ${company.name}`;
  const facts: [string, string][] = inv.isCredit
    ? [["Krediterat belopp", amount], ["Krediterar faktura", inv.creditedNumber ?? "—"]]
    : [
        ["Att betala", amount],
        ["Förfallodatum", inv.dueDate ?? "—"],
        ["Bankgiro", bankgiro || "—"],
        ["OCR-nummer", inv.ocr ?? "—"],
      ];
  const greeting = `Hej${inv.reference ? ` ${inv.reference}` : ""},`;
  const intro = inv.isCredit
    ? `Här kommer kreditfaktura ${inv.number} från ${company.name}.`
    : `Här kommer faktura ${inv.number} från ${company.name}.`;
  const outro = inv.isCredit ? "" : "Ange OCR-numret när du betalar, så kopplas betalningen till rätt faktura.";
  const signature = [inv.ourReference, company.name].filter(Boolean) as string[];

  const text = [
    greeting,
    "",
    intro,
    "",
    ...facts.map(([k, v]) => `${k}: ${v}`),
    "",
    "Fakturan finns bifogad som PDF.",
    ...(outro ? [outro] : []),
    "",
    "Med vänliga hälsningar",
    ...signature,
  ].join("\n");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#0a2540;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;margin:12px 0">${facts
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#636366">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>
<p>Fakturan finns bifogad som PDF.${outro ? `<br>${escapeHtml(outro)}` : ""}</p>
<p>Med vänliga hälsningar<br>${signature.map(escapeHtml).join("<br>")}</p>
</div>`;

  const safeName = (inv.customer.name || "kund").replace(/[^a-zA-Z0-9_-]/g, "_");
  const bcc = (process.env.INVOICE_EMAIL_BCC ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let providerId: string | undefined;
  try {
    const res = await fetch(`${process.env.RESEND_API_URL || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: process.env.INVOICE_EMAIL_FROM,
        to: [to],
        ...(bcc.length ? { bcc } : {}),
        ...(company.email ? { reply_to: company.email } : {}),
        subject,
        text,
        html,
        attachments: [
          { filename: `${kind}_${inv.number}_${safeName}.pdf`, content: Buffer.from(bytes).toString("base64") },
        ],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return fail(`E-posttjänsten svarade ${res.status}: ${body?.message ?? res.statusText}`);
    providerId = body?.id;
  } catch (e: any) {
    return fail(`Kunde inte nå e-posttjänsten: ${e?.message ?? e}`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      email_to: to,
      emailed_at: now,
      ...(row.status === "draft" ? { status: "sent", sent_at: now } : {}),
    })
    .eq("id", invoiceId);
  await log("sent", { provider_id: providerId });
  if (updateError) return { ok: false, error: `Mejlet skickades men fakturan kunde inte uppdateras: ${updateError.message}` };

  // En skickad kreditfaktura markerar originalet som krediterat (som i editorn).
  if (row.status === "draft" && row.credited_invoice_id) {
    await supabase.from("invoices").update({ status: "credited" }).eq("id", row.credited_invoice_id);
  }
  // Ett tidigare misslyckat automatiskt utskick av just den här fakturan är nu löst.
  if (row.recurring_income_id) {
    await supabase
      .from("recurring_income")
      .update({ last_error: null })
      .eq("id", row.recurring_income_id)
      .like("last_error", `Faktura ${row.number} %`);
  }
  return { ok: true, to };
}

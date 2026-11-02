// Server-hjälpare för bankavstämningen (regler i ./bank-match, tabell och
// funktioner i migration 0040). Körs med service role-klienten: kopplingarna
// skrivs bara av servern, precis som banktabellerna.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BankInvoiceMatch,
  type MatchInvoice,
  type MatchTransaction,
  classifyPair,
  planMatches,
} from "./bank-match";

export const MATCH_TX_COLUMNS = "id,status,booking_date,amount,currency,counterparty,description,reference";
export const MATCH_INVOICE_COLUMNS =
  "id,number,ocr,status,credited_invoice_id,customer_name,amount_sek,currency,issued_at,due_date";
export const MATCH_COLUMNS = "id,bank_transaction_id,invoice_id,status,method,rule,created_at";

/** Så långt bakåt synken letar efter okopplade inbetalningar. */
const AUTO_MATCH_DAYS = 365;

/** Tabellen saknas = migration 0040 är inte körd; avstämningen hoppas då över. */
export function missingMatchTable(message: string | undefined): boolean {
  return !!message && /bank_invoice_matches|bank_match_/.test(message);
}

/**
 * Kopplar entydiga starka träffar (OCR/fakturanummer + exakt belopp) och
 * markerar fakturorna som betalda. Svaga träffar lämnas som förslag.
 * Returnerar antalet fakturor som markerades som betalda.
 */
export async function autoMatchInvoices(admin: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - AUTO_MATCH_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [txs, invoices, matches] = await Promise.all([
    admin
      .from("bank_transactions")
      .select(MATCH_TX_COLUMNS)
      .eq("status", "BOOK")
      .gt("amount", 0)
      .gte("booking_date", since),
    admin
      .from("invoices")
      .select(MATCH_INVOICE_COLUMNS)
      .in("status", ["sent", "overdue"])
      .is("credited_invoice_id", null),
    admin.from("bank_invoice_matches").select("bank_transaction_id,invoice_id,status"),
  ]);
  const error = txs.error ?? invoices.error ?? matches.error;
  if (error) {
    if (missingMatchTable(error.message)) return 0;
    throw new Error(error.message);
  }
  if (!txs.data?.length || !invoices.data?.length) return 0;

  const { autoApply } = planMatches(
    txs.data as MatchTransaction[],
    invoices.data as MatchInvoice[],
    (matches.data ?? []) as BankInvoiceMatch[],
  );
  let applied = 0;
  for (const s of autoApply) {
    const { error: rpcErr } = await admin.rpc("bank_match_apply", {
      p_transaction: s.transactionId,
      p_invoice: s.invoiceId,
      p_method: "auto",
      p_rule: s.rule,
    });
    // Ett par som någon hann koppla för hand under tiden är inget fel.
    if (rpcErr) console.warn(`bank-match: ${s.transactionId} → ${s.invoiceId}: ${rpcErr.message}`);
    else applied += 1;
  }
  return applied;
}

/**
 * Manuell koppling ("Markera som betald"). Regeln räknas fram på servern så
 * att kopplingen sparar varför den gjordes; finns ingen regel blir den
 * 'manual'. Belopp och status kontrolleras igen av bank_match_apply.
 */
export async function applyMatch(
  admin: SupabaseClient,
  transactionId: string,
  invoiceId: string,
  userId: string,
): Promise<string> {
  const [tx, inv] = await Promise.all([
    admin.from("bank_transactions").select(MATCH_TX_COLUMNS).eq("id", transactionId).maybeSingle(),
    admin.from("invoices").select(MATCH_INVOICE_COLUMNS).eq("id", invoiceId).maybeSingle(),
  ]);
  if (tx.error || inv.error) throw new Error((tx.error ?? inv.error)!.message);
  if (!tx.data) throw new Error("Banktransaktionen finns inte.");
  if (!inv.data) throw new Error("Fakturan finns inte.");
  const rule = classifyPair(tx.data as MatchTransaction, inv.data as MatchInvoice)?.rule ?? "manual";
  const { data, error } = await admin.rpc("bank_match_apply", {
    p_transaction: transactionId,
    p_invoice: invoiceId,
    p_method: "manual",
    p_rule: rule,
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function undoMatch(admin: SupabaseClient, matchId: string, userId: string) {
  const { error } = await admin.rpc("bank_match_undo", { p_match: matchId, p_user: userId });
  if (error) throw new Error(error.message);
}

export async function dismissMatch(
  admin: SupabaseClient,
  transactionId: string,
  invoiceId: string,
  userId: string,
) {
  const { error } = await admin.rpc("bank_match_dismiss", {
    p_transaction: transactionId,
    p_invoice: invoiceId,
    p_user: userId,
  });
  if (error) throw new Error(error.message);
}

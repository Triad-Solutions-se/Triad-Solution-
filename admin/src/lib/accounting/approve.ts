// Bokför ett godkänt förslag och låter underlagen följa med: en inbetalning kopplas
// till fakturan, en leverantörsfaktura blir betald, ett utlägg återbetalt. Väljer
// någon ett annat konto eller annan moms sparas valet som regel för motparten.
// Körs med service role-klienten från API:t.

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMatch, undoMatch } from "../bank-match-data";
import { ACC, isVatCode, sanitizeLines } from "./core";
import type { Proposal, TxRow } from "./proposals";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ApproveInput = {
  key: string;
  date: string;
  description: string;
  lines: unknown;
  vat?: unknown;
};

export type PostedEntry = { id: string; number: number; series: string };

export async function approveProposal(
  admin: SupabaseClient,
  proposal: Proposal,
  input: ApproveInput,
  transaction: TxRow | null,
  userId: string,
): Promise<PostedEntry> {
  if (!ISO_DATE.test(input.date)) throw new Error("Ogiltigt datum.");
  const lines = sanitizeLines(input.lines);
  const link = proposal.link;

  // Kopplingen görs först: den kontrollerar belopp och att fakturan är obetald.
  let matchId: string | null = null;
  if (link?.type === "invoice" && link.applyMatch && proposal.transactionId) {
    matchId = await applyMatch(admin, proposal.transactionId, link.id, userId);
  }

  const { data, error } = await admin.rpc("accounting_post_entry", {
    p_date: input.date,
    p_description: input.description || proposal.description,
    p_lines: lines,
    p_source_key: proposal.key,
    p_link_key: link ? `${link.type}:${link.id}` : null,
    p_user: userId,
  });
  if (error) {
    if (matchId) await undoMatch(admin, matchId, userId).catch(() => {});
    throw new Error(error.message);
  }

  // Från och med här är verifikationen bokförd. Fel i underlagen stoppar inte det.
  const bankAccountId = transaction?.bank_account_id ?? null;
  const paidOn = transaction?.booking_date ?? input.date;
  if (link?.type === "payment") {
    await admin
      .from("payments")
      .update({ status: "paid", paid_at: paidOn, bank_account_id: bankAccountId })
      .eq("id", link.id);
  } else if (link?.type === "expense") {
    await admin.from("expenses").update({ status: "reimbursed", bank_account_id: bankAccountId }).eq("id", link.id);
  } else if (link?.type === "income") {
    await admin.from("income").update({ status: "received", date: paidOn, bank_account_id: bankAccountId }).eq("id", link.id);
  }

  if (proposal.learn) await learnFromChoice(admin, proposal, input);
  return data as PostedEntry;
}

async function learnFromChoice(admin: SupabaseClient, proposal: Proposal, input: ApproveInput) {
  if (!proposal.learn || !Array.isArray(input.lines)) return;
  const chosen = (input.lines as { role?: string; account?: number }[]).find((l) => l.role === "primary");
  const before = proposal.lines.find((l) => l.role === "primary");
  if (!chosen?.account || !before || chosen.account === ACC.SUSPENSE) return;
  const vat = isVatCode(input.vat) ? input.vat : proposal.vat;
  if (!vat) return;
  const unchanged = chosen.account === before.account && vat === proposal.vat;
  // En gissning som någon godkänt som den är lärs in också: nu är den bekräftad.
  if (unchanged && proposal.confidence !== "guess") return;
  await admin.from("accounting_rules").upsert(
    {
      pattern: proposal.learn.pattern,
      direction: proposal.learn.direction,
      account: chosen.account,
      vat_code: vat,
      origin: "learned",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pattern" },
  );
}

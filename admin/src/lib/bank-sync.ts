// Bankkoppling: koppla konton efter BankID-medgivandet och synka saldo +
// transaktioner från Enable Banking till bank_accounts / bank_transactions.
//
// Körs med service role-klienten (createAdminClient): tabellerna är skrivskyddade
// för medlemmar och cron-synken har ingen inloggad användare.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EnableBankingError,
  deleteSession,
  getBalances,
  getTransactions,
  listAspsps,
  type Balance,
  type PsuHeaders,
  type SessionAccount,
  type Transaction,
} from "./enable-banking";
import { autoMatchInvoices } from "./bank-match-data";

/** Banken som kopplas. Standard Lunar i Sverige; går att ändra via env. */
export const BANK_NAME = process.env.ENABLE_BANKING_ASPSP || "Lunar";
export const BANK_COUNTRY = process.env.ENABLE_BANKING_COUNTRY || "SE";

const MAX_CONSENT_SECONDS = 180 * 24 * 3600;

export type BankConnection = {
  id: string;
  aspsp_name: string;
  aspsp_country: string;
  status: string;
  session_id: string | null;
  target_bank_account_id: string | null;
  valid_until: string | null;
};

export async function resolveAspsp() {
  const list = await listAspsps(BANK_COUNTRY);
  const wanted = BANK_NAME.toLowerCase();
  const aspsp =
    list.find((a) => a.name.toLowerCase() === wanted) ??
    list.find((a) => a.name.toLowerCase().includes(wanted));
  if (!aspsp) {
    throw new Error(`Hittade inte banken "${BANK_NAME}" (${BANK_COUNTRY}) hos Enable Banking.`);
  }
  const envType = process.env.ENABLE_BANKING_PSU_TYPE;
  const psuType: "business" | "personal" =
    envType === "business" || envType === "personal"
      ? envType
      : aspsp.psu_types?.includes("business") || !aspsp.psu_types?.length
        ? "business"
        : "personal";
  const seconds = Math.min(aspsp.maximum_consent_validity ?? 90 * 24 * 3600, MAX_CONSENT_SECONDS);
  const validUntil = new Date(Date.now() + (seconds - 120) * 1000);
  return { aspsp: { name: aspsp.name, country: aspsp.country }, psuType, validUntil };
}

// --- Konton -------------------------------------------------------------------

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function accountIdentifier(a: SessionAccount): string | null {
  return (
    a.account_id?.iban ??
    a.account_id?.other?.identification ??
    a.all_account_ids?.[0]?.identification ??
    null
  );
}

const onlyOne = <T,>(list: T[]): T | undefined => (list.length === 1 ? list[0] : undefined);

type PortalAccount = {
  id: string;
  name: string;
  archived: boolean;
  account_number: string | null;
  bank: string | null;
  provider_account_uid: string | null;
  provider_account_hash: string | null;
  connection_id: string | null;
};

/**
 * Knyter kontona i ett nytt medgivande till bankkonton i portalen. Matchar i
 * ordning: samma konto hos Enable Banking (hash), samma kontonummer (sista 7
 * siffrorna), kontot man klickade "Koppla till banken" på, det enda okopplade
 * kontot med bankens namn, annars skapas ett nytt.
 */
export async function linkSessionAccounts(
  admin: SupabaseClient,
  conn: BankConnection,
  accounts: SessionAccount[],
): Promise<string[]> {
  const { data, error } = await admin
    .from("bank_accounts")
    .select("id,name,archived,account_number,bank,provider_account_uid,provider_account_hash,connection_id");
  if (error) throw new Error(error.message);
  const existing = (data ?? []) as PortalAccount[];
  const used = new Set<string>();
  const linked: string[] = [];
  const bankWord = conn.aspsp_name.toLowerCase();
  const sameBank = (p: PortalAccount) =>
    !p.archived &&
    !p.provider_account_hash &&
    `${p.bank ?? ""} ${p.name}`.toLowerCase().includes(bankWord);

  for (const acc of accounts) {
    const ident = accountIdentifier(acc);
    const tail = digits(ident).slice(-7);
    const free = (p: PortalAccount) => !used.has(p.id);

    let match =
      existing.find((p) => free(p) && p.provider_account_uid === acc.uid) ??
      (acc.identification_hash
        ? existing.find((p) => free(p) && p.provider_account_hash === acc.identification_hash)
        : undefined) ??
      (tail.length === 7
        ? existing.find(
            (p) =>
              free(p) &&
              !p.archived &&
              !p.provider_account_hash &&
              digits(p.account_number).slice(-7) === tail,
          )
        : undefined) ??
      existing.find(
        (p) => free(p) && p.id === conn.target_bank_account_id && !p.provider_account_hash,
      ) ??
      onlyOne(existing.filter((p) => free(p) && sameBank(p)));

    const link = {
      connection_id: conn.id,
      provider_account_uid: acc.uid,
      provider_account_hash: acc.identification_hash ?? null,
    };

    if (match) {
      const { error: upErr } = await admin
        .from("bank_accounts")
        .update({
          ...link,
          account_number: match.account_number || ident,
          bank: match.bank || conn.aspsp_name,
        })
        .eq("id", match.id);
      if (upErr) throw new Error(upErr.message);
    } else {
      const label = acc.name || acc.product || acc.details || "konto";
      const { data: created, error: insErr } = await admin
        .from("bank_accounts")
        .insert({
          ...link,
          name: `${conn.aspsp_name} ${label}`.trim(),
          bank: conn.aspsp_name,
          account_number: ident,
          currency: acc.currency || "SEK",
          starting_balance: 0,
        })
        .select("id,name,archived,account_number,bank,provider_account_uid,provider_account_hash,connection_id")
        .single();
      if (insErr) throw new Error(insErr.message);
      match = created as PortalAccount;
      existing.push(match);
    }
    used.add(match.id);
    linked.push(match.id);
  }
  return linked;
}

/** En ny koppling mot samma bank ersätter äldre: stäng dem hos Enable Banking. */
export async function retireOlderConnections(admin: SupabaseClient, conn: BankConnection) {
  const { data } = await admin
    .from("bank_connections")
    .select("id,session_id,status")
    .eq("aspsp_name", conn.aspsp_name)
    .eq("aspsp_country", conn.aspsp_country)
    .neq("id", conn.id)
    .in("status", ["active", "expired", "error"]);
  for (const old of data ?? []) {
    if (old.status === "active" && old.session_id) {
      await deleteSession(old.session_id).catch(() => {});
    }
    await admin.from("bank_connections").update({ status: "revoked" }).eq("id", old.id);
  }
}

// --- Synk -------------------------------------------------------------------

/** Saldot som bäst motsvarar "pengar på kontot just nu" i bankens app. */
const BALANCE_PREFERENCE = ["ITAV", "CLAV", "XPCD", "ITBD", "CLBD", "OPAV", "OPBD"];

export function pickBalance(balances: Balance[]): Balance | null {
  for (const type of BALANCE_PREFERENCE) {
    const hit = balances.find((b) => b.balance_type === type);
    if (hit) return hit;
  }
  return balances[0] ?? null;
}

export function transactionRow(tx: Transaction, bankAccountId: string, externalId: string) {
  const raw = Math.abs(Number(tx.transaction_amount.amount) || 0);
  const amount = tx.credit_debit_indicator === "DBIT" ? -raw : raw;
  const counterparty = (amount < 0 ? tx.creditor?.name : tx.debtor?.name) || null;
  const description =
    [...(tx.remittance_information ?? []), tx.note].filter(Boolean).join(" · ") || null;
  return {
    bank_account_id: bankAccountId,
    external_id: externalId,
    status: tx.status === "BOOK" ? "BOOK" : "PDNG",
    booking_date: tx.booking_date ?? tx.transaction_date ?? tx.value_date ?? null,
    value_date: tx.value_date ?? null,
    amount,
    currency: tx.transaction_amount.currency || "SEK",
    counterparty,
    description,
    reference: tx.reference_number ?? null,
    raw: tx,
  };
}

/**
 * Stabilt id per transaktion. Bankens eget id om det finns; annars en hash av
 * innehållet plus löpnummer för identiska rader samma dag (två kaffe à 45 kr).
 */
export function externalIds(txs: Transaction[], prefix = ""): string[] {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    const own = tx.transaction_id || tx.entry_reference;
    if (own) return prefix + own;
    const key = [
      tx.booking_date ?? tx.transaction_date ?? tx.value_date ?? "",
      tx.credit_debit_indicator,
      tx.transaction_amount.amount,
      tx.transaction_amount.currency,
      tx.creditor?.name ?? "",
      tx.debtor?.name ?? "",
      (tx.remittance_information ?? []).join("|"),
      tx.reference_number ?? "",
    ].join("§");
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${prefix}h:${createHash("sha256").update(key).digest("hex").slice(0, 32)}:${n}`;
  });
}

function daysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function syncAccount(
  admin: SupabaseClient,
  acct: { id: string; provider_account_uid: string },
  psu?: PsuHeaders,
) {
  const uid = acct.provider_account_uid;

  const { balances } = await getBalances(uid, psu);
  const balance = pickBalance(balances ?? []);
  if (balance) {
    const { error } = await admin
      .from("bank_accounts")
      .update({
        synced_balance: Number(balance.balance_amount.amount),
        synced_balance_type: balance.balance_type,
        synced_at: new Date().toISOString(),
      })
      .eq("id", acct.id);
    if (error) throw new Error(error.message);
  }

  // Första synken: så lång historik som banken ger. Sedan: från senaste
  // bokförda dagen med tio dagars överlapp för sent bokförda transaktioner.
  const { data: latest } = await admin
    .from("bank_transactions")
    .select("booking_date")
    .eq("bank_account_id", acct.id)
    .eq("status", "BOOK")
    .not("booking_date", "is", null)
    .order("booking_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastDate = (latest as { booking_date: string } | null)?.booking_date ?? null;

  const all: Transaction[] = [];
  let continuationKey: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await getTransactions(uid, {
      dateFrom: lastDate ? daysBefore(lastDate, 10) : undefined,
      strategy: lastDate ? "default" : "longest",
      continuationKey,
      psu,
    });
    all.push(...(res.transactions ?? []));
    continuationKey = res.continuation_key || undefined;
    if (!continuationKey) break;
  }

  const booked = all.filter((t) => t.status === "BOOK");
  const pending = all.filter((t) => t.status !== "BOOK");
  const bookedIds = externalIds(booked);
  const pendingIds = externalIds(pending, "p:");
  const bookedRows = booked.map((t, i) => transactionRow(t, acct.id, bookedIds[i]));
  const pendingRows = pending.map((t, i) => transactionRow(t, acct.id, pendingIds[i]));

  for (let i = 0; i < bookedRows.length; i += 500) {
    const { error } = await admin
      .from("bank_transactions")
      .upsert(bookedRows.slice(i, i + 500), { onConflict: "bank_account_id,external_id" });
    if (error) throw new Error(error.message);
  }
  // Reserverade transaktioner har inget stabilt id — ersätt dem helt.
  const { error: delErr } = await admin
    .from("bank_transactions")
    .delete()
    .eq("bank_account_id", acct.id)
    .neq("status", "BOOK");
  if (delErr) throw new Error(delErr.message);
  if (pendingRows.length) {
    const { error } = await admin.from("bank_transactions").insert(pendingRows);
    if (error) throw new Error(error.message);
  }

  return { booked: bookedRows.length, pending: pendingRows.length };
}

export type SyncResult = {
  connectionId: string;
  status: string;
  accounts: number;
  transactions: number;
  /** Fakturor som markerades som betalda av en inbetalning i den här synken. */
  matched: number;
  error?: string;
};

export async function syncConnection(
  admin: SupabaseClient,
  conn: BankConnection,
  psu?: PsuHeaders,
): Promise<SyncResult> {
  const result: SyncResult = {
    connectionId: conn.id,
    status: conn.status,
    accounts: 0,
    transactions: 0,
    matched: 0,
  };
  if (conn.status !== "active" || !conn.session_id) return result;

  if (conn.valid_until && new Date(conn.valid_until).getTime() < Date.now()) {
    await admin
      .from("bank_connections")
      .update({ status: "expired", last_error: "Medgivandet har gått ut — koppla om banken." })
      .eq("id", conn.id);
    return { ...result, status: "expired" };
  }

  const { data: accounts, error } = await admin
    .from("bank_accounts")
    .select("id,provider_account_uid")
    .eq("connection_id", conn.id)
    .not("provider_account_uid", "is", null);
  if (error) throw new Error(error.message);

  try {
    for (const acct of (accounts ?? []) as { id: string; provider_account_uid: string }[]) {
      const r = await syncAccount(admin, acct, psu);
      result.accounts += 1;
      result.transactions += r.booked + r.pending;
    }
    await admin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);
    // Avstämningen mot fakturor får inte fälla synken — förslagen syns ändå
    // på Ekonomi-sidan och går att koppla för hand.
    try {
      result.matched = await autoMatchInvoices(admin);
    } catch (e) {
      console.error("bank-match:", e instanceof Error ? e.message : e);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const gone = e instanceof EnableBankingError && e.sessionGone;
    await admin
      .from("bank_connections")
      .update({ last_error: message, ...(gone ? { status: "expired" } : {}) })
      .eq("id", conn.id);
    return { ...result, status: gone ? "expired" : conn.status, error: message };
  }
  return result;
}

export async function syncAllConnections(admin: SupabaseClient, psu?: PsuHeaders) {
  const { data, error } = await admin
    .from("bank_connections")
    .select("id,aspsp_name,aspsp_country,status,session_id,target_bank_account_id,valid_until")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const results: SyncResult[] = [];
  for (const conn of (data ?? []) as BankConnection[]) {
    results.push(await syncConnection(admin, conn, psu));
  }
  return results;
}

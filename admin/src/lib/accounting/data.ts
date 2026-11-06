// Server-hjälpare för bokföringen: hämtar underlag och huvudbok. Fungerar med både
// den inloggade klienten (sidorna) och service role-klienten (API:t).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankInvoiceMatch } from "../bank-match";
import { MATCH_COLUMNS, MATCH_INVOICE_COLUMNS } from "../bank-match-data";
import { todayISO } from "../invoice";
import { ACC, type Account, ore } from "./core";
import type { FiscalYear, VatPeriod, VatPeriodType } from "./periods";
import { fiscalYearFor, vatPeriods } from "./periods";
import {
  type BankAccountRow,
  type Decision,
  type ExpenseRow,
  type IncomeRow,
  type InvoiceRow,
  type PaymentRow,
  type Proposal,
  type QueueResult,
  type Skipped,
  type TxRow,
  type VatClosing,
  buildQueue,
} from "./proposals";
import {
  type LedgerEntry,
  type LedgerLine,
  type PostedLine,
  postedLines,
  reversalPairIds,
  vatClosingEntryIds,
} from "./reports";
import type { AccountingRule } from "./rules";

const PAGE = 1000;

/** Hämtar alla rader i omgångar: PostgREST ger som mest 1 000 åt gången. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export type AccountingSettings = {
  start_date: string;
  fiscal_year_start_month: number;
  vat_period: VatPeriodType;
  locked_through: string | null;
};

/** Null när migration 0044 inte är körd. */
export async function loadSettings(supabase: SupabaseClient): Promise<AccountingSettings | null> {
  const { data, error } = await supabase
    .from("accounting_settings")
    .select("start_date,fiscal_year_start_month,vat_period,locked_through")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return data as AccountingSettings | null;
}

export async function loadAccounts(supabase: SupabaseClient): Promise<Account[]> {
  return fetchAll<Account>((from, to) =>
    supabase.from("accounting_accounts").select("number,name,vat_box,common,active,custom").order("number").range(from, to),
  );
}

export async function loadFiscalYears(supabase: SupabaseClient): Promise<FiscalYear[]> {
  const { data, error } = await supabase
    .from("accounting_fiscal_years")
    .select("id,start_date,end_date,closed_at")
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FiscalYear[];
}

export type Ledger = {
  entries: LedgerEntry[];
  lines: LedgerLine[];
  posted: PostedLine[];
  closingIds: Set<string>;
  reversalIds: Set<string>;
};

export async function loadLedger(supabase: SupabaseClient): Promise<Ledger> {
  const [entries, rawLines] = await Promise.all([
    fetchAll<LedgerEntry>((from, to) =>
      supabase
        .from("journal_entries")
        .select("id,fiscal_year_id,series,number,date,description,source_key,link_key,reverses_entry_id,attachment_path,created_by,created_at")
        .order("date")
        .order("number")
        .range(from, to),
    ),
    fetchAll<LedgerLine>((from, to) =>
      supabase
        .from("journal_lines")
        .select("entry_id,line_no,account,debit,credit,vat_box,note")
        .order("entry_id")
        .order("line_no")
        .range(from, to),
    ),
  ]);
  const lines = rawLines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) }));
  return {
    entries,
    lines,
    posted: postedLines(entries, lines),
    closingIds: vatClosingEntryIds(entries),
    reversalIds: reversalPairIds(entries),
  };
}

export type Decided = Decision & { decided_at?: string };

export async function loadDecisions(supabase: SupabaseClient): Promise<Decided[]> {
  return fetchAll<Decided>((from, to) =>
    supabase
      .from("accounting_decisions")
      .select("source_key,decision,entry_id,link_key,note,decided_at")
      .order("source_key")
      .range(from, to),
  );
}

/** Kopplade bankkonton → första bokförda dag, samma avgränsning som cashflow. */
async function historyStarts(supabase: SupabaseClient, accounts: { id: string; connection_id?: string | null }[]) {
  const connected = accounts.filter((a) => a.connection_id);
  const results = await Promise.all(
    connected.map((a) =>
      supabase
        .from("bank_transactions")
        .select("booking_date")
        .eq("bank_account_id", a.id)
        .eq("status", "BOOK")
        .not("booking_date", "is", null)
        .order("booking_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ),
  );
  const map = new Map<string, string>();
  connected.forEach((a, i) => {
    const date = (results[i].data as { booking_date: string } | null)?.booking_date;
    if (date) map.set(a.id, date);
  });
  return map;
}

const INVOICE_COLUMNS = `${MATCH_INVOICE_COLUMNS},net_amount,vat_amount,vat_rate,paid_at,bank_account_id`;

/** Periodens momsavslut som ska föras till skattekontot. */
export function vatClosingsFrom(ledger: Ledger, periods: VatPeriod[]): VatClosing[] {
  const reversed = new Set(ledger.entries.map((e) => e.reverses_entry_id).filter(Boolean) as string[]);
  const out: VatClosing[] = [];
  for (const e of ledger.entries) {
    if (!e.source_key?.startsWith("vat-close:") || reversed.has(e.id)) continue;
    const periodId = e.source_key.slice("vat-close:".length);
    const period = periods.find((p) => p.id === periodId);
    const payable =
      ledger.lines
        .filter((l) => l.entry_id === e.id && l.account === ACC.VAT_SETTLEMENT)
        .reduce((s, l) => s + ore(l.credit) - ore(l.debit), 0) / 100;
    // Helårsmoms saknar framräknat datum: periodens sista dag används, och kön
    // flyttar posten till första öppna dag.
    out.push({ periodId, label: period?.label ?? periodId, due: period?.due ?? period?.to ?? e.date, payable });
  }
  return out;
}

export type QueueData = QueueResult & {
  settings: AccountingSettings;
  accounts: Account[];
  fiscalYears: FiscalYear[];
  ledger: Ledger;
  decisions: Decided[];
  bankAccounts: (BankAccountRow & { name: string; synced_balance: number | null; connection_id: string | null })[];
  transactions: TxRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  rules: AccountingRule[];
  periods: VatPeriod[];
  today: string;
  byKey: Map<string, Proposal>;
  /** Bokförda verifikationer vars underlag har ändrats eller försvunnit. */
  stale: { key: string; entryId: string; series: string; number: number; reason: string }[];
  skipped: Skipped[];
};

export async function loadQueue(supabase: SupabaseClient): Promise<QueueData | null> {
  const settings = await loadSettings(supabase);
  if (!settings) return null;
  const today = todayISO();
  const [accounts, fiscalYears, ledger, decisions, rules, bankAccountsRes, transactions, invoices, payments, expenses, income, matches] =
    await Promise.all([
      loadAccounts(supabase),
      loadFiscalYears(supabase),
      loadLedger(supabase),
      loadDecisions(supabase),
      fetchAll<AccountingRule>((from, to) =>
        supabase.from("accounting_rules").select("id,pattern,direction,account,vat_code,origin").order("pattern").range(from, to),
      ),
      supabase.from("bank_accounts").select("id,name,ledger_account,synced_balance,connection_id,archived"),
      fetchAll<TxRow>((from, to) =>
        supabase
          .from("bank_transactions")
          .select("id,bank_account_id,status,booking_date,value_date,amount,currency,counterparty,description,reference,receipt_path")
          .in("status", ["BOOK", "PDNG"])
          .order("booking_date")
          .order("id")
          .range(from, to),
      ),
      fetchAll<InvoiceRow>((from, to) =>
        supabase.from("invoices").select(INVOICE_COLUMNS).order("issued_at").order("id").range(from, to),
      ),
      fetchAll<PaymentRow>((from, to) =>
        supabase
          .from("payments")
          .select("id,description,amount_sek,category,status,due_date,paid_at,bank_account_id,invoice_path,created_at")
          .order("created_at")
          .range(from, to),
      ),
      fetchAll<ExpenseRow>((from, to) =>
        supabase
          .from("expenses")
          .select("id,description,amount_sek,category,paid_by,date,status,bank_account_id,receipt_url,created_at")
          .order("created_at")
          .range(from, to),
      ),
      fetchAll<IncomeRow>((from, to) =>
        supabase
          .from("income")
          .select("id,description,amount_sek,date,status,bank_account_id,invoice_id")
          .order("date")
          .range(from, to),
      ),
      fetchAll<BankInvoiceMatch>((from, to) =>
        supabase.from("bank_invoice_matches").select(MATCH_COLUMNS).order("created_at").range(from, to),
      ),
    ]);
  if (bankAccountsRes.error) throw new Error(bankAccountsRes.error.message);
  const bankAccounts = (bankAccountsRes.data ?? []) as QueueData["bankAccounts"];
  const historyStart = await historyStarts(supabase, bankAccounts);
  const periods = vatPeriods(settings.vat_period, settings.start_date, today, fiscalYears);

  const queue = buildQueue({
    startDate: settings.start_date,
    lockedThrough: settings.locked_through,
    bankAccounts,
    historyStart,
    invoices,
    transactions,
    matches,
    payments,
    expenses,
    income,
    rules,
    decisions,
    vatClosings: vatClosingsFrom(ledger, periods),
  });

  const entryById = new Map(ledger.entries.map((e) => [e.id, e]));
  const stale: QueueData["stale"] = [];
  for (const d of decisions) {
    if (d.decision !== "booked" || !d.entry_id) continue;
    // Momsavslut har inget underlag som kan ändras.
    if (d.source_key.startsWith("vat-")) continue;
    const entry = entryById.get(d.entry_id);
    if (!entry) continue;
    const gross = queue.desired.get(d.source_key);
    const label = `${entry.series}${entry.number}`;
    if (gross == null) {
      stale.push({
        key: d.source_key,
        entryId: entry.id,
        series: entry.series,
        number: entry.number,
        reason: `${label} ${entry.description}: underlaget finns inte längre eller är ändrat till utkast.`,
      });
      continue;
    }
    const largest = ledger.lines
      .filter((l) => l.entry_id === entry.id)
      .reduce((m, l) => Math.max(m, ore(l.debit), ore(l.credit)), 0);
    if (largest !== ore(gross)) {
      stale.push({
        key: d.source_key,
        entryId: entry.id,
        series: entry.series,
        number: entry.number,
        reason: `${label} ${entry.description}: bokfört belopp ${largest / 100} kr, underlaget är nu ${gross} kr.`,
      });
    }
  }

  return {
    ...queue,
    settings,
    accounts,
    fiscalYears,
    ledger,
    decisions,
    bankAccounts,
    transactions,
    invoices,
    payments,
    expenses,
    rules,
    periods,
    today,
    byKey: new Map(queue.proposals.map((p) => [p.key, p])),
    stale,
  };
}

/** Valt räkenskapsår ur ?ar=<id>, annars året dagens datum ligger i, annars det senaste. */
export function selectFiscalYear(years: FiscalYear[], id: string | undefined, today: string): FiscalYear | null {
  return years.find((y) => y.id === id) ?? fiscalYearFor(years, today) ?? years[0] ?? null;
}

export async function companyName(supabase: SupabaseClient): Promise<{ name: string; orgNumber: string | null }> {
  const { data } = await supabase.from("company_settings").select("name,org_number").eq("id", 1).maybeSingle();
  return { name: data?.name?.trim() || "MCA Solutions AB", orgNumber: data?.org_number ?? null };
}

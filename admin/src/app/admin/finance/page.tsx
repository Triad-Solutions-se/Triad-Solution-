import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ChevronRight, FolderArchive, Landmark, Repeat } from "lucide-react";
import { fmtDate } from "@/lib/date";
import { fmtAmount, isOutstanding, todayISO } from "@/lib/invoice";
import { NewPaymentButton, PaymentsTable } from "./PaymentsSection";
import { NewRecurringButton, RecurringTable } from "./RecurringSection";
import { NewRecurringIncomeButton, RecurringIncomeTable, type PlanInvoiceRef } from "./RecurringIncomeSection";
import { materializeRecurring } from "@/lib/recurring-data";
import { type RecurringPlan, toMonthly } from "@/lib/recurring";
import { NewInvoiceButton } from "../invoices/NewInvoiceButton";
import { InvoiceStatusChip } from "../invoices/InvoiceStatusChip";
import { NewExpenseButton, ExpensesTable } from "./ExpensesSection";
import { NewIncomeButton, IncomeTable } from "./IncomeSection";
import {
  BankAccountsGrid,
  NewBankAccountButton,
  type BankAccount,
  type BankAccountWithBalance,
} from "./BankAccountsSection";
import { CashflowChart } from "./CashflowChart";
import { BankConnectionBar, type BankConnectionInfo } from "./BankConnectionBar";
import { BankTransactionsTable, type BankTransaction } from "./BankTransactionsTable";
import { enableBankingConfigured } from "@/lib/enable-banking";
import { BANK_NAME } from "@/lib/bank-sync";
import { type BankInvoiceMatch, type MatchInvoice, describeMatches } from "@/lib/bank-match";
import { MATCH_COLUMNS } from "@/lib/bank-match-data";
import { type BankCashRow, buildCashflow } from "@/lib/cashflow";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const sumAmount = (rows: any[]) => rows.reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const CASHFLOW_MONTHS = 12;

const BANK_TX_COLUMNS = "id,bank_account_id,status,booking_date,amount,currency,counterparty,description,reference";

/** Senaste banktransaktionerna, med kvitto om migration 0041 är körd (annars utan). */
async function loadBankTransactions(supabase: Awaited<ReturnType<typeof createClient>>) {
  const query = (columns: string) =>
    supabase
      .from("bank_transactions")
      .select(columns)
      .order("booking_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<BankTransaction[]>();
  const withReceipts = await query(`${BANK_TX_COLUMNS},receipt_path`);
  if (!withReceipts.error) return { ...withReceipts, receipts: true };
  return { ...(await query(BANK_TX_COLUMNS)), receipts: false };
}

export default async function FinancePage() {
  const supabase = await createClient();
  // Skapa income-rader och fakturautkast för passerade förfallodatum på
  // återkommande intäkter innan datan hämtas, så tabellerna nedan visar dem.
  await materializeRecurring(supabase);
  // Första dagen i cashflow-diagrammets tidsfönster (samma 12 månader som CashflowChart).
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (CASHFLOW_MONTHS - 1), 1);
  const windowStartISO = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, "0")}-01`;
  const [
    expenses,
    income,
    invoices,
    payments,
    recurring,
    recurringIncome,
    profiles,
    bankAccounts,
    projects,
    customers,
    agreements,
    bankConnections,
    bankTransactions,
    bankMatches,
    bankCashTx,
  ] = await Promise.all([
    supabase.from("expenses").select("*").order("date", { ascending: false }),
    supabase.from("income").select("*").order("date", { ascending: false }),
    supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*, assignee:profiles!payments_assignee_id_fkey(id,display_name,email)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("recurring_payments")
      .select("*, assignee:profiles!recurring_payments_assignee_id_fkey(id,display_name,email)")
      .order("next_due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("recurring_income")
      .select("*")
      .order("next_due_date", { ascending: true, nullsFirst: false }),
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
    supabase.from("bank_accounts").select("*").order("archived").order("name"),
    supabase.from("projects").select("id,name").order("name"),
    supabase.from("customers").select("id,name").order("name"),
    supabase.from("agreements").select("id,agreement_number"),
    supabase
      .from("bank_connections")
      .select("id,aspsp_name,status,valid_until,last_synced_at,last_error")
      .in("status", ["active", "expired", "error"])
      .order("created_at", { ascending: false }),
    loadBankTransactions(supabase),
    supabase.from("bank_invoice_matches").select(MATCH_COLUMNS),
    supabase
      .from("bank_transactions")
      .select("bank_account_id,booking_date,amount")
      .eq("status", "BOOK")
      .gte("booking_date", windowStartISO),
  ]);

  const expensesData = expenses.data ?? [];
  const incomeData = income.data ?? [];
  const invoicesData = invoices.data ?? [];
  const paymentsData = payments.data ?? [];
  const recurringData = recurring.data ?? [];
  const recurringIncomeData = (recurringIncome.data ?? []) as RecurringPlan[];
  const profileList = profiles.data ?? [];
  const bankList = (bankAccounts.data ?? []) as BankAccount[];
  const projectList = (projects.data ?? []) as { id: string; name: string }[];
  const customerList = (customers.data ?? []) as { id: string; name: string }[];
  const agreementList = (agreements.data ?? []) as { id: string; agreement_number: string | null }[];
  const invoiceNumber = new Map<string, string>(invoicesData.map((r: any) => [r.id, r.number]));
  // Bankkopplingen visas när migrationen 0039 är körd och Enable Banking är konfigurerat.
  const bankSyncEnabled = !bankConnections.error && enableBankingConfigured();
  const connectionList = (bankConnections.data ?? []) as BankConnectionInfo[];
  const connection = connectionList[0] ?? null;
  const liveConnections = new Set(
    connectionList.filter((c) => c.status === "active" || c.status === "expired").map((c) => c.id),
  );
  const bankTxList = bankTransactions.data ?? [];
  // Avstämning inbetalning → faktura (migration 0040). Utan tabellen visas inga förslag.
  const matchingEnabled = bankSyncEnabled && !bankMatches.error;
  const matchList = (bankMatches.data ?? []) as BankInvoiceMatch[];
  const txMatches = matchingEnabled
    ? describeMatches(bankTxList, invoicesData as MatchInvoice[], matchList)
    : {};
  const suggestionCount = Object.values(txMatches).filter((m) => m.suggestions.length > 0).length;
  const paidViaBank = new Set(matchList.filter((m) => m.status === "applied").map((m) => m.invoice_id));

  const monthlyEquivalent = (rows: any[]) =>
    rows
      .filter((r: any) => r.active)
      .reduce((s: number, r: any) => s + toMonthly(r.amount_sek, r.frequency), 0);
  const totalRecurringMonthly = monthlyEquivalent(recurringData);
  const totalRecurringIncomeMonthly = monthlyEquivalent(recurringIncomeData);

  // Bank balances: starting balance + received income + reimbursed/paid expenses + paid payments
  const bankWithBalance: BankAccountWithBalance[] = bankList.map((b) => {
    const start = Number(b.starting_balance || 0);
    const inflow = incomeData
      .filter((r: any) => r.bank_account_id === b.id && r.status === "received")
      .reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
    const expOut = expensesData
      .filter((r: any) => r.bank_account_id === b.id && r.status === "reimbursed")
      .reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
    const payOut = paymentsData
      .filter((r: any) => r.bank_account_id === b.id && r.status === "paid")
      .reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
    const outflow = expOut + payOut;
    const synced =
      b.connection_id && liveConnections.has(b.connection_id) && b.synced_balance != null
        ? Number(b.synced_balance)
        : null;
    return {
      ...b,
      starting_balance: start,
      inflow,
      outflow,
      currentBalance: start + inflow - outflow,
      bankBalance: synced,
    };
  });
  // Kassa: bankens saldo för kopplade konton, annars portalens beräknade.
  const openAccounts = bankWithBalance.filter((b) => !b.archived);
  const totalCash = openAccounts.reduce((s, b) => s + (b.bankBalance ?? b.currentBalance), 0);
  const syncedAccounts = openAccounts.filter((b) => b.bankBalance != null).length;
  const cashHint = !openAccounts.length
    ? "Inga bankkonton än"
    : syncedAccounts === openAccounts.length
      ? "Saldo enligt banken"
      : syncedAccounts > 0
        ? "Bankens saldo + portalens beräkning"
        : "Beräknat i portalen";

  // Intäkter. Bekräftade = mottagna i år; betalda fakturor bokförs som
  // mottagna intäkter (0036) och räknas därför med här. Ej bekräftade = allt
  // som väntar på betalning: intäkter som ingen har markerat som mottagna och
  // skickade fakturor som inte är betalda (de får en intäktsrad först när de betalas).
  const today = todayISO();
  const confirmedIncome = sumAmount(
    incomeData.filter((r: any) => r.status === "received" && String(r.date ?? "").startsWith(today.slice(0, 4))),
  );
  const unconfirmedRows = incomeData.filter((r: any) => r.status !== "received");
  const outstandingInvoices = invoicesData.filter((r: any) => isOutstanding(r));
  const unconfirmedIncome = sumAmount(unconfirmedRows) + sumAmount(outstandingInvoices);
  const overdueInvoices = sumAmount(
    outstandingInvoices.filter((r: any) => r.status === "overdue" || (r.due_date && r.due_date < today)),
  );
  const unconfirmedHint =
    [
      unconfirmedRows.length ? plural(unconfirmedRows.length, "intäkt att bekräfta", "intäkter att bekräfta") : null,
      outstandingInvoices.length ? plural(outstandingInvoices.length, "obetald faktura", "obetalda fakturor") : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Inget väntar på betalning";

  const activePlans = recurringIncomeData.filter((r) => r.active);
  const plansWithoutInvoice = activePlans.filter((r) => !r.create_invoices).length;
  const planInvoices = invoicesData.filter((r: any) => r.recurring_income_id) as PlanInvoiceRef[];

  const unreimbursed = sumAmount(expensesData.filter((r: any) => r.status !== "reimbursed"));

  // Cashflow: bankens bokförda transaktioner för kopplade konton, portalens
  // poster (mottagna intäkter, återbetalda utlägg, betalda betalningar) för
  // resten. Bankhistoriken börjar vid kontots första bokförda transaktion.
  const syncedIds = bankWithBalance.filter((b) => b.bankBalance != null).map((b) => b.id);
  const firstBooked = await Promise.all(
    syncedIds.map((id) =>
      supabase
        .from("bank_transactions")
        .select("booking_date")
        .eq("bank_account_id", id)
        .eq("status", "BOOK")
        .not("booking_date", "is", null)
        .order("booking_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ),
  );
  const historyStart = new Map<string, string>();
  syncedIds.forEach((id, i) => {
    const date = firstBooked[i].data?.booking_date;
    if (date) historyStart.set(id, date);
  });
  const cashflow = buildCashflow({
    income: incomeData
      .filter((r: any) => r.status === "received")
      .map((r: any) => ({ date: r.date, amount_sek: r.amount_sek, bank_account_id: r.bank_account_id })),
    outgoing: [
      ...expensesData
        .filter((r: any) => r.status === "reimbursed")
        .map((r: any) => ({ date: r.date, amount_sek: r.amount_sek, bank_account_id: r.bank_account_id })),
      ...paymentsData
        .filter((r: any) => r.status === "paid")
        .map((r: any) => ({
          date: r.paid_at ?? r.due_date,
          amount_sek: r.amount_sek,
          bank_account_id: r.bank_account_id,
        })),
    ],
    bankTx: (bankCashTx.data ?? []) as BankCashRow[],
    historyStart,
  });
  const cashflowHint = historyStart.size
    ? `Pengar som faktiskt har rört sig: bankens transaktioner för kopplade konton (även insättningar som aktiekapital), portalens poster för övriga konton och före ${fmtDate([...historyStart.values()].sort()[0])}.`
    : "Bara pengar som faktiskt har rört sig: mottagna intäkter (även betalda fakturor), återbetalda utlägg och betalda betalningar.";

  return (
    <>
      <PageHeader
        title="Ekonomi"
        subtitle="Kassa, pengar in och pengar ut."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/files"
              className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
            >
              <FolderArchive size={16} />
              Månadsarkiv
            </Link>
            <NewInvoiceButton customers={customerList} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <FinanceStat label="Kassa" value={SEK(Math.round(totalCash))} color="teal" hint={cashHint} />
        <FinanceStat label="Bekräftade intäkter" value={SEK(confirmedIncome)} color="green" hint="Mottaget i år" />
        <FinanceStat
          label="Ej bekräftade intäkter"
          value={SEK(unconfirmedIncome)}
          color="amber"
          hint={unconfirmedHint}
          note={overdueInvoices > 0 ? { text: `${SEK(overdueInvoices)} har förfallit`, tone: "red" } : undefined}
        />
        <FinanceStat
          label="Återkommande intäkter / mån"
          value={SEK(Math.round(totalRecurringIncomeMonthly))}
          color="blue"
          hint={activePlans.length ? plural(activePlans.length, "aktiv plan", "aktiva planer") : "Inga aktiva planer"}
          note={
            plansWithoutInvoice > 0
              ? { text: `${plansWithoutInvoice} skapar ingen faktura`, tone: "amber" }
              : undefined
          }
        />
      </div>

      <Section title="Cashflow" hint={cashflowHint}>
        <CashflowChart income={cashflow.income} expenses={cashflow.expenses} months={CASHFLOW_MONTHS} />
      </Section>

      <Section title="Bankkonton & kassa" right={<NewBankAccountButton variant="small" />}>
        {bankSyncEnabled && <BankConnectionBar connection={connection} bankName={BANK_NAME} />}
        <BankAccountsGrid accounts={bankWithBalance} canConnect={bankSyncEnabled} />
      </Section>

      {bankSyncEnabled && (bankTxList.length > 0 || connection?.status === "active") && (
        <Section
          title="Banktransaktioner"
          right={
            suggestionCount > 0 && (
              <span className="text-xs text-teal-300">
                {suggestionCount === 1
                  ? "1 inbetalning kan vara en fakturabetalning"
                  : `${suggestionCount} inbetalningar kan vara fakturabetalningar`}
              </span>
            )
          }
        >
          <BankTransactionsTable
            rows={bankTxList}
            accounts={bankList.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
            matches={txMatches}
            receipts={bankTransactions.receipts}
          />
        </Section>
      )}

      <GroupHeading>Pengar in</GroupHeading>

      <Section
        title="Fakturor"
        right={
          <Link href="/admin/invoices" className="text-xs text-teal-300 hover:text-teal-200 flex items-center gap-1">
            Alla fakturor <ChevronRight size={14} />
          </Link>
        }
      >
        <table className="w-full text-sm min-w-[540px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Fakturanummer</th>
              <th className="p-3">Kund</th>
              <th className="p-3">Utfärdad</th>
              <th className="p-3">Förfaller</th>
              <th className="p-3">Belopp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {invoicesData.slice(0, 10).map((r: any) => (
              <tr key={r.id} className="hover:bg-white/[0.04] transition-colors">
                <td className="p-3 font-mono">
                  <span className="inline-flex items-center gap-1.5">
                    <Link href={`/admin/invoices/${r.id}`} className="hover:text-teal-300">
                      {r.number}
                    </Link>
                    {r.recurring_income_id && (
                      <span title="Skapad av återkommande fakturering" className="text-[var(--muted)]">
                        <Repeat size={12} />
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3 text-[var(--muted)]">
                  {r.customer_name ?? customerList.find((c) => c.id === r.customer_id)?.name ?? "—"}
                </td>
                <td className="p-3 text-[var(--muted)]">{fmtDate(r.issued_at)}</td>
                <td className="p-3 text-[var(--muted)]">{r.credited_invoice_id ? "—" : fmtDate(r.due_date)}</td>
                <td className="p-3 font-mono">
                  {fmtAmount(r.amount_sek)} {r.currency ?? "SEK"}
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5">
                    <InvoiceStatusChip invoice={r} />
                    {r.status === "paid" && paidViaBank.has(r.id) && (
                      <span title="Betald — kopplad till en inbetalning från banken" className="text-teal-300">
                        <Landmark size={13} />
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {!invoicesData.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga fakturor än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        title="Återkommande intäkter & fakturering"
        hint="Prenumerationer och avtal. Med Fakturera automatiskt blir varje period en riktig faktura med OCR-nummer."
        right={
          <>
            <span className="text-xs text-[var(--muted)] font-mono">
              {SEK(Math.round(totalRecurringIncomeMonthly))}/mån
            </span>
            <NewRecurringIncomeButton label="Ny plan" variant="small" />
          </>
        }
      >
        <RecurringIncomeTable
          rows={recurringIncomeData}
          customers={customerList}
          agreements={agreementList}
          invoices={planInvoices}
        />
      </Section>

      <Section
        title="Intäkter"
        hint="Bekräfta en intäkt när pengarna har kommit in. Betalda fakturor hamnar här automatiskt."
        right={
          <NewIncomeButton customers={customerList} projects={projectList} bankAccounts={bankList} variant="small" />
        }
      >
        <IncomeTable
          rows={incomeData as any}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
          invoiceNumbers={Object.fromEntries(invoiceNumber)}
        />
      </Section>

      <GroupHeading>Pengar ut</GroupHeading>

      <Section
        title="Betalningar"
        hint="Räkningar och fakturor som företaget ska betala."
        right={
          <NewPaymentButton profiles={profileList} projects={projectList} bankAccounts={bankList} variant="small" />
        }
      >
        <PaymentsTable
          rows={paymentsData as any}
          profiles={profileList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section
        title="Återkommande betalningar"
        hint="Prenumerationer och andra fasta kostnader."
        right={
          <>
            <span className="text-xs text-[var(--muted)] font-mono">{SEK(Math.round(totalRecurringMonthly))}/mån</span>
            <NewRecurringButton
              profiles={profileList}
              projects={projectList}
              bankAccounts={bankList}
              label="Ny återkommande"
              variant="small"
            />
          </>
        }
      >
        <RecurringTable
          rows={recurringData as any}
          profiles={profileList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section
        title="Utlägg"
        hint="Köp som någon i teamet har betalat själv och ska få tillbaka."
        right={
          <>
            {unreimbursed > 0 && (
              <span className="text-xs text-[var(--muted)]">
                Ej återbetalt <span className="font-mono text-rose-300">{SEK(unreimbursed)}</span>
              </span>
            )}
            <NewExpenseButton projects={projectList} bankAccounts={bankList} variant="small" />
          </>
        }
      >
        <ExpensesTable
          rows={expensesData as any}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>
    </>
  );
}

const financeColorMap = {
  green: { accentBar: "bg-emerald-400", numColor: "text-emerald-300" },
  red: { accentBar: "bg-rose-400", numColor: "text-rose-300" },
  teal: { accentBar: "bg-teal-400", numColor: "text-teal-300" },
  blue: { accentBar: "bg-sky-400", numColor: "text-sky-300" },
  amber: { accentBar: "bg-amber-400", numColor: "text-amber-300" },
};

function FinanceStat({
  label,
  value,
  color,
  hint,
  note,
}: {
  label: string;
  value: string;
  color: keyof typeof financeColorMap;
  // Vad siffran räknar, på en rad under beloppet.
  hint?: string;
  // Något som behöver göras (förfallna fakturor, planer utan faktura).
  note?: { text: string; tone: "red" | "amber" };
}) {
  const c = financeColorMap[color];
  return (
    <div className="glass rounded-xl border border-white/10 p-5 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.accentBar}`} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className={`font-heading text-xl sm:text-2xl font-bold mt-2 ${c.numColor}`}>{value}</div>
        {hint && <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>}
        {note && (
          <div className={`text-xs mt-0.5 ${note.tone === "red" ? "text-rose-300" : "text-amber-300"}`}>
            {note.text}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mt-10 mb-3">
      {children}
    </h2>
  );
}

function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl border border-white/10 overflow-hidden mb-6">
      <header className="px-5 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold">{title}</h2>
          {hint && <p className="text-xs text-[var(--muted)] mt-0.5">{hint}</p>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </header>
      <div className="overflow-x-auto scroll-x-hint">{children}</div>
    </section>
  );
}

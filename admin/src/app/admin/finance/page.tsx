import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ChevronRight, FolderArchive, Landmark } from "lucide-react";
import { fmtDate } from "@/lib/date";
import { fmtAmount, isOutstanding } from "@/lib/invoice";
import { NewPaymentButton, PaymentsTable } from "./PaymentsSection";
import { NewRecurringButton, RecurringTable } from "./RecurringSection";
import { NewRecurringIncomeButton, RecurringIncomeTable } from "./RecurringIncomeSection";
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

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

export default async function FinancePage() {
  const supabase = await createClient();
  // Skapa income-rader och fakturautkast för passerade förfallodatum på
  // återkommande intäkter innan datan hämtas, så tabellerna nedan visar dem.
  await materializeRecurring(supabase);
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
    supabase
      .from("bank_transactions")
      .select("id,bank_account_id,status,booking_date,amount,currency,counterparty,description,reference")
      .order("booking_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("bank_invoice_matches").select(MATCH_COLUMNS),
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
  const bankTxList = (bankTransactions.data ?? []) as BankTransaction[];
  // Avstämning inbetalning → faktura (migration 0040). Utan tabellen visas inga förslag.
  const matchingEnabled = bankSyncEnabled && !bankMatches.error;
  const matchList = (bankMatches.data ?? []) as BankInvoiceMatch[];
  const txMatches = matchingEnabled
    ? describeMatches(bankTxList, invoicesData as MatchInvoice[], matchList)
    : {};
  const suggestionCount = Object.values(txMatches).filter((m) => m.suggestions.length > 0).length;
  const paidViaBank = new Set(matchList.filter((m) => m.status === "applied").map((m) => m.invoice_id));

  const totalExp = expensesData.reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const totalInc = incomeData.reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const monthlyEquivalent = (rows: any[]) =>
    rows
      .filter((r: any) => r.active)
      .reduce((s: number, r: any) => s + toMonthly(r.amount_sek, r.frequency), 0);
  const totalRecurringMonthly = monthlyEquivalent(recurringData);
  const totalRecurringIncomeMonthly = monthlyEquivalent(recurringIncomeData);
  const net = totalInc - totalExp;

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
  const totalCash = bankWithBalance
    .filter((b) => !b.archived)
    .reduce((s, b) => s + (b.bankBalance ?? b.currentBalance), 0);

  // Outstanding receivables: sent, unpaid invoices (drafts and credit notes excluded)
  const outstanding = invoicesData
    .filter((r: any) => isOutstanding(r))
    .reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);

  // Cashflow chart: use received income vs reimbursed/paid expenses for actual movement
  const realizedIncome = incomeData.filter((r: any) => r.status === "received");
  const realizedExpenses = [
    ...expensesData
      .filter((r: any) => r.status === "reimbursed")
      .map((r: any) => ({ date: r.date, amount_sek: r.amount_sek })),
    ...paymentsData
      .filter((r: any) => r.status === "paid")
      .map((r: any) => ({ date: r.paid_at ?? r.due_date, amount_sek: r.amount_sek })),
  ];

  return (
    <>
      <PageHeader
        title="Ekonomi"
        subtitle="Cashflow, kassa, fakturor, intäkter och utlägg."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/files"
              className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
            >
              <FolderArchive size={16} />
              Månadsarkiv
            </Link>
            <NewBankAccountButton />
            <NewPaymentButton
              profiles={profileList}
              projects={projectList}
              bankAccounts={bankList}
            />
            <NewRecurringButton
              profiles={profileList}
              projects={projectList}
              bankAccounts={bankList}
            />
            <NewRecurringIncomeButton />
            <NewInvoiceButton customers={customerList} variant="secondary" />
            <NewIncomeButton
              customers={customerList}
              projects={projectList}
              bankAccounts={bankList}
            />
            <NewExpenseButton projects={projectList} bankAccounts={bankList} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 mb-8">
        <FinanceStat label="Kassa" value={SEK(Math.round(totalCash))} color="teal" />
        <FinanceStat label="Intäkter" value={SEK(totalInc)} color="green" />
        <FinanceStat label="Utlägg" value={SEK(totalExp)} color="red" />
        <FinanceStat label="Netto" value={SEK(net)} color={net >= 0 ? "teal" : "red"} />
        <FinanceStat label="Utestående fakturor" value={SEK(outstanding)} color="blue" />
        <FinanceStat
          label="Återkommande / mån"
          value={SEK(Math.round(totalRecurringIncomeMonthly))}
          color="green"
        />
      </div>

      <Section title="Cashflow">
        <CashflowChart income={realizedIncome} expenses={realizedExpenses} months={12} />
      </Section>

      <Section title="Bankkonton & kassa">
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
          />
        </Section>
      )}

      <div className="text-xs text-[var(--muted)] mb-4 -mt-2">
        Återkommande kostnader / mån:{" "}
        <span className="font-mono">{SEK(Math.round(totalRecurringMonthly))}</span>
        {" · "}Netto återkommande / mån:{" "}
        <span
          className={`font-mono ${totalRecurringIncomeMonthly - totalRecurringMonthly >= 0 ? "text-emerald-300" : "text-rose-300"}`}
        >
          {SEK(Math.round(totalRecurringIncomeMonthly - totalRecurringMonthly))}
        </span>
      </div>

      <Section title="Betalningar">
        <PaymentsTable
          rows={paymentsData as any}
          profiles={profileList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section title="Återkommande betalningar">
        <RecurringTable
          rows={recurringData as any}
          profiles={profileList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section title="Återkommande intäkter & fakturering">
        <RecurringIncomeTable rows={recurringIncomeData} customers={customerList} agreements={agreementList} />
      </Section>

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
                  <Link href={`/admin/invoices/${r.id}`} className="hover:text-teal-300">
                    {r.number}
                  </Link>
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

      <Section title="Intäkter">
        <IncomeTable
          rows={incomeData as any}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
          invoiceNumbers={Object.fromEntries(invoiceNumber)}
        />
      </Section>

      <Section title="Utlägg">
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
};

function FinanceStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: keyof typeof financeColorMap;
}) {
  const c = financeColorMap[color];
  return (
    <div className="glass rounded-xl border border-white/10 p-5 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.accentBar}`} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className={`font-heading text-xl sm:text-2xl font-bold mt-2 ${c.numColor}`}>{value}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl border border-white/10 overflow-hidden mb-6">
      <header className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-heading font-semibold">{title}</h2>
        {right}
      </header>
      <div className="overflow-x-auto scroll-x-hint">{children}</div>
    </section>
  );
}

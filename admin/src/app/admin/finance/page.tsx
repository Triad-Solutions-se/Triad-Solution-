import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { FolderArchive } from "lucide-react";
import { NewPaymentButton, PaymentsTable } from "./PaymentsSection";
import { NewRecurringButton, RecurringTable } from "./RecurringSection";
import { NewRecurringIncomeButton, RecurringIncomeTable } from "./RecurringIncomeSection";
import { materializeRecurringIncome } from "./materializeRecurringIncome";
import { NewInvoiceButton, InvoicesTable } from "./InvoicesSection";
import { NewExpenseButton, ExpensesTable } from "./ExpensesSection";
import { NewIncomeButton, IncomeTable } from "./IncomeSection";
import {
  BankAccountsGrid,
  NewBankAccountButton,
  type BankAccount,
  type BankAccountWithBalance,
} from "./BankAccountsSection";
import { CashflowChart } from "./CashflowChart";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

export default async function FinancePage() {
  const supabase = await createClient();
  // Skapa income-rader för passerade förfallodatum på återkommande intäkter
  // innan datan hämtas, så tabellerna nedan visar dem direkt.
  await materializeRecurringIncome(supabase);
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
  ]);

  const expensesData = expenses.data ?? [];
  const incomeData = income.data ?? [];
  const invoicesData = invoices.data ?? [];
  const paymentsData = payments.data ?? [];
  const recurringData = recurring.data ?? [];
  const recurringIncomeData = recurringIncome.data ?? [];
  const profileList = profiles.data ?? [];
  const bankList = (bankAccounts.data ?? []) as BankAccount[];
  const projectList = (projects.data ?? []) as { id: string; name: string }[];
  const customerList = (customers.data ?? []) as { id: string; name: string }[];

  const totalExp = expensesData.reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const totalInc = incomeData.reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const monthlyEquivalent = (rows: any[]) =>
    rows
      .filter((r: any) => r.active)
      .reduce((s: number, r: any) => {
        const amt = Number(r.amount_sek || 0);
        if (r.frequency === "monthly") return s + amt;
        if (r.frequency === "quarterly") return s + amt / 3;
        if (r.frequency === "yearly") return s + amt / 12;
        return s;
      }, 0);
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
    return {
      ...b,
      starting_balance: start,
      inflow,
      outflow,
      currentBalance: start + inflow - outflow,
    };
  });
  const totalCash = bankWithBalance
    .filter((b) => !b.archived)
    .reduce((s, b) => s + b.currentBalance, 0);

  // Outstanding receivables: unpaid invoices
  const outstanding = invoicesData
    .filter((r: any) => r.status !== "paid" && r.status !== "credited")
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
            <NewRecurringIncomeButton
              customers={customerList}
              projects={projectList}
              bankAccounts={bankList}
            />
            <NewInvoiceButton
              customers={customerList}
              projects={projectList}
              bankAccounts={bankList}
              existingNumbers={invoicesData.map((r: any) => r.number).filter(Boolean)}
            />
            <NewIncomeButton
              customers={customerList}
              projects={projectList}
              bankAccounts={bankList}
            />
            <NewExpenseButton projects={projectList} bankAccounts={bankList} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-8">
        <FinanceStat label="Kassa" value={SEK(Math.round(totalCash))} color="teal" />
        <FinanceStat label="Intäkter" value={SEK(totalInc)} color="green" />
        <FinanceStat label="Utlägg" value={SEK(totalExp)} color="red" />
        <FinanceStat label="Netto" value={SEK(net)} color={net >= 0 ? "teal" : "red"} />
        <FinanceStat label="Utestående fakturor" value={SEK(outstanding)} color="blue" />
      </div>

      <Section title="Cashflow">
        <CashflowChart income={realizedIncome} expenses={realizedExpenses} months={12} />
      </Section>

      <Section title="Bankkonton & kassa">
        <BankAccountsGrid accounts={bankWithBalance} />
      </Section>

      <div className="text-xs text-[var(--muted)] mb-4 -mt-2">
        Återkommande intäkter / mån:{" "}
        <span className="font-mono text-emerald-300">{SEK(Math.round(totalRecurringIncomeMonthly))}</span>
        {" · "}Återkommande kostnader / mån:{" "}
        <span className="font-mono">{SEK(Math.round(totalRecurringMonthly))}</span>
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

      <Section title="Återkommande intäkter">
        <RecurringIncomeTable
          rows={recurringIncomeData as any}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section title="Fakturor">
        <InvoicesTable
          rows={invoicesData as any}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
        />
      </Section>

      <Section title="Intäkter">
        <IncomeTable
          rows={incomeData as any}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-xl border border-white/10 overflow-hidden mb-6">
      <header className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-heading font-semibold">{title}</h2>
      </header>
      <div className="overflow-x-auto scroll-x-hint">{children}</div>
    </section>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { FolderArchive } from "lucide-react";
import { NewPaymentButton, PaymentsTable } from "./PaymentsSection";
import { NewRecurringButton, RecurringTable } from "./RecurringSection";
import { NewInvoiceButton, InvoicesTable } from "./InvoicesSection";
import { NewExpenseButton, ExpensesTable } from "./ExpensesSection";
import { NewIncomeButton, IncomeTable } from "./IncomeSection";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

export default async function FinancePage() {
  const supabase = await createClient();
  const [expenses, income, invoices, payments, recurring, profiles] = await Promise.all([
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
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
  ]);

  const totalExp = (expenses.data ?? []).reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const totalInc = (income.data ?? []).reduce((s: number, r: any) => s + Number(r.amount_sek || 0), 0);
  const totalRecurringMonthly = (recurring.data ?? [])
    .filter((r: any) => r.active)
    .reduce((s: number, r: any) => {
      const amt = Number(r.amount_sek || 0);
      if (r.frequency === "monthly") return s + amt;
      if (r.frequency === "quarterly") return s + amt / 3;
      if (r.frequency === "yearly") return s + amt / 12;
      return s;
    }, 0);
  const net = totalInc - totalExp;
  const profileList = profiles.data ?? [];

  return (
    <>
      <PageHeader
        title="Ekonomi"
        subtitle="Betalningar, fakturor, intäkter och utlägg."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/finance/files"
              className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
            >
              <FolderArchive size={16} />
              Månadsarkiv
            </Link>
            <NewPaymentButton profiles={profileList} />
            <NewRecurringButton profiles={profileList} />
            <NewInvoiceButton />
            <NewIncomeButton />
            <NewExpenseButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
        <FinanceStat label="Intäkter" value={SEK(totalInc)} color="green" />
        <FinanceStat label="Utlägg" value={SEK(totalExp)} color="red" />
        <FinanceStat label="Netto" value={SEK(net)} color={net >= 0 ? "teal" : "red"} />
        <FinanceStat label="Återk. /mån" value={SEK(Math.round(totalRecurringMonthly))} color="blue" />
      </div>

      <Section title="Betalningar">
        <PaymentsTable rows={(payments.data ?? []) as any} profiles={profileList} />
      </Section>

      <Section title="Återkommande betalningar">
        <RecurringTable rows={(recurring.data ?? []) as any} profiles={profileList} />
      </Section>

      <Section title="Fakturor">
        <InvoicesTable rows={(invoices.data ?? []) as any} />
      </Section>

      <Section title="Intäkter">
        <IncomeTable rows={(income.data ?? []) as any} />
      </Section>

      <Section title="Utlägg">
        <ExpensesTable rows={(expenses.data ?? []) as any} />
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

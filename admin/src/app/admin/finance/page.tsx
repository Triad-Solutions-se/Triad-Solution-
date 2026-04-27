import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { FolderArchive } from "lucide-react";
import { NewPaymentButton } from "./NewPaymentButton";
import { NewRecurringButton } from "./NewRecurringButton";
import { NewInvoiceButton } from "./NewInvoiceButton";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Månadsvis",
  quarterly: "Kvartalsvis",
  yearly: "Årsvis",
};

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
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Beskrivning</th>
              <th className="p-3">Tilldelad</th>
              <th className="p-3">Kategori</th>
              <th className="p-3">Förfaller</th>
              <th className="p-3">Belopp</th>
              <th className="p-3">Faktura</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(payments.data ?? []).map((r: any) => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="p-3">
                  <div className="font-medium">{r.description}</div>
                  {r.notes && <div className="text-xs text-[var(--muted)]">{r.notes}</div>}
                </td>
                <td className="p-3 text-[var(--muted)]">
                  {r.assignee?.display_name ?? r.assignee?.email ?? "—"}
                </td>
                <td className="p-3 text-[var(--muted)]">{r.category ?? "—"}</td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.due_date)}
                </td>
                <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
                <td className="p-3">
                  {r.invoice_path ? <InvoiceLink path={r.invoice_path} /> : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="p-3">
                  <Chip tone={r.status === "paid" ? "green" : r.status === "overdue" ? "red" : "yellow"}>
                    {r.status === "paid" ? "Betald" : r.status === "overdue" ? "Försenad" : "Väntar"}
                  </Chip>
                </td>
              </tr>
            ))}
            {!payments.data?.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga betalningar än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Återkommande betalningar">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Beskrivning</th>
              <th className="p-3">Tilldelad</th>
              <th className="p-3">Frekvens</th>
              <th className="p-3">Nästa förfallodag</th>
              <th className="p-3">Belopp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(recurring.data ?? []).map((r: any) => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="p-3">
                  <div className="font-medium">{r.description}</div>
                  {r.category && <div className="text-xs text-[var(--muted)]">{r.category}</div>}
                </td>
                <td className="p-3 text-[var(--muted)]">
                  {r.assignee?.display_name ?? r.assignee?.email ?? "—"}
                </td>
                <td className="p-3 text-[var(--muted)]">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.next_due_date)}
                </td>
                <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
                <td className="p-3">
                  <Chip tone={r.active ? "green" : "gray"}>{r.active ? "Aktiv" : "Pausad"}</Chip>
                </td>
              </tr>
            ))}
            {!recurring.data?.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga återkommande betalningar än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Fakturor">
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
            {(invoices.data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="p-3 font-mono">{r.number}</td>
                <td className="p-3 text-[var(--muted)]">{r.customer_name ?? "—"}</td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.issued_at)}
                </td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.due_date)}
                </td>
                <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
                <td className="p-3">
                  <Chip
                    tone={
                      r.status === "paid"
                        ? "green"
                        : r.status === "overdue"
                        ? "red"
                        : r.status === "sent"
                        ? "blue"
                        : "gray"
                    }
                  >
                    {r.status}
                  </Chip>
                </td>
              </tr>
            ))}
            {!invoices.data?.length && (
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
        <table className="w-full text-sm min-w-[540px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Beskrivning</th>
              <th className="p-3">Källa</th>
              <th className="p-3">Datum</th>
              <th className="p-3">Belopp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(income.data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="p-3">{r.description}</td>
                <td className="p-3 text-[var(--muted)]">{r.source ?? "—"}</td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.date)}
                </td>
                <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
                <td className="p-3">
                  <Chip tone={r.status === "received" ? "green" : r.status === "pending" ? "yellow" : "red"}>
                    {r.status}
                  </Chip>
                </td>
              </tr>
            ))}
            {!income.data?.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga intäkter än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Utlägg">
        <table className="w-full text-sm min-w-[540px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Beskrivning</th>
              <th className="p-3">Kategori</th>
              <th className="p-3">Betald av</th>
              <th className="p-3">Datum</th>
              <th className="p-3">Belopp</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(expenses.data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="p-3">{r.description}</td>
                <td className="p-3 text-[var(--muted)]">{r.category ?? "—"}</td>
                <td className="p-3 text-[var(--muted)]">{r.paid_by ?? "—"}</td>
                <td className="p-3 text-[var(--muted)]">
                  {fmtDate(r.date)}
                </td>
                <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
                <td className="p-3">
                  <Chip tone={r.status === "reimbursed" ? "green" : "red"}>
                    {r.status === "reimbursed" ? "Återbetald" : "Ej återbetald"}
                  </Chip>
                </td>
              </tr>
            ))}
            {!expenses.data?.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga utlägg än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

function InvoiceLink({ path }: { path: string }) {
  const name = path.split("/").pop() ?? "Faktura";
  return (
    <a
      href={`/admin/finance/files/download?path=${encodeURIComponent(path)}`}
      className="text-xs text-teal-400 hover:underline"
    >
      {name}
    </a>
  );
}

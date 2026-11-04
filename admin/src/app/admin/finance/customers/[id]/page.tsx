import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark, Repeat } from "lucide-react";
import { fmtDate } from "@/lib/date";
import { effectiveStatus, fmtAmount, isOutstanding, todayISO } from "@/lib/invoice";
import { type RecurringPlan, periodName } from "@/lib/recurring";
import { materializeRecurring } from "@/lib/recurring-data";
import { customerEconomyHref, customerStatus, economyByCustomer, emptyEconomy, toReceive } from "@/lib/customer";
import { EditCustomerButton } from "../../../customers/EditCustomerButton";
import { NewInvoiceButton } from "../../../invoices/NewInvoiceButton";
import { InvoiceStatusChip } from "../../../invoices/InvoiceStatusChip";
import { NewRecurringIncomeButton, RecurringIncomeTable, type PlanInvoiceRef } from "../../RecurringIncomeSection";
import { IncomeTable, NewIncomeButton, type Income } from "../../IncomeSection";
import { FinanceStat, Section } from "../../FinanceBlocks";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const FILTERS = [
  { value: "all", label: "Alla" },
  { value: "unpaid", label: "Obetalda" },
  { value: "paid", label: "Betalda" },
];

type InvoiceRow = PlanInvoiceRef & {
  ocr: string | null;
  customer_id: string | null;
  issued_at: string | null;
  paid_at: string | null;
};

// Kundsidan under Ekonomi: kunduppgifter, nyckeltal, återkommande planer,
// fakturor med betalt/obetalt och kundens intäkter.
export default async function CustomerEconomyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const filter = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "all";
  const supabase = await createClient();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) notFound();

  // Fakturautkast och intäktsrader för passerade perioder skapas innan datan hämtas.
  await materializeRecurring(supabase);
  const [invoicesRes, incomeRes, plansRes, customersRes, projectsRes, banksRes, agreementsRes, matchesRes] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", id)
        .order("issued_at", { ascending: false, nullsFirst: false })
        .order("number", { ascending: false }),
      supabase.from("income").select("*").eq("customer_id", id).order("date", { ascending: false }),
      supabase
        .from("recurring_income")
        .select("*")
        .eq("customer_id", id)
        .order("next_due_date", { ascending: true, nullsFirst: false }),
      supabase.from("customers").select("id,name").order("name"),
      supabase.from("projects").select("id,name").order("name"),
      supabase.from("bank_accounts").select("id,name").order("archived").order("name"),
      supabase.from("agreements").select("id,agreement_number").eq("customer_id", id),
      // Fel (migration 0040 ej körd) → ingen bankikon.
      supabase.from("bank_invoice_matches").select("invoice_id").eq("status", "applied"),
    ]);

  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const income = (incomeRes.data ?? []) as Income[];
  const plans = (plansRes.data ?? []) as RecurringPlan[];
  const customerList = (customersRes.data ?? []) as { id: string; name: string }[];
  const projectList = (projectsRes.data ?? []) as { id: string; name: string }[];
  const bankList = (banksRes.data ?? []) as { id: string; name: string }[];
  const agreementList = (agreementsRes.data ?? []) as { id: string; agreement_number: string | null }[];
  const paidViaBank = new Set((matchesRes.data ?? []).map((m: { invoice_id: string }) => m.invoice_id));
  const invoiceNumbers = Object.fromEntries(invoices.map((r) => [r.id, r.number]));

  const today = todayISO();
  const e = economyByCustomer({ income, invoices, plans }, today).get(id) ?? emptyEconomy();
  const due = toReceive(e);
  const status = customerStatus(customer.status);

  const unpaid = invoices.filter((r) => isOutstanding(r));
  const paid = invoices.filter((r) => r.status === "paid");
  const shown = filter === "unpaid" ? unpaid : filter === "paid" ? paid : invoices;
  const counts: Record<string, number> = { all: invoices.length, unpaid: unpaid.length, paid: paid.length };

  const dueHint =
    [
      e.outstandingCount ? plural(e.outstandingCount, "obetald faktura", "obetalda fakturor") : null,
      e.pendingCount ? plural(e.pendingCount, "intäkt att bekräfta", "intäkter att bekräfta") : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Inget obetalt";

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/finance"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Ekonomi
        </Link>
      </div>
      <PageHeader
        title={customer.name}
        subtitle="Kunduppgifter, fakturor, betalningar och återkommande planer."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <EditCustomerButton customer={customer} />
            <NewRecurringIncomeButton preset={{ customerId: id }} label="Ny plan" />
            <NewInvoiceButton
              customers={[{ id, name: customer.name }]}
              preset={{ customerId: id }}
              label="Fakturera"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <FinanceStat
          label="Återkommande / mån"
          value={SEK(Math.round(e.monthly))}
          color="blue"
          hint={e.activePlans ? plural(e.activePlans, "aktiv plan", "aktiva planer") : "Inga aktiva planer"}
        />
        <FinanceStat
          label="Betalt i år"
          value={SEK(e.receivedYear)}
          color="green"
          hint={e.lastReceived ? `Senast ${fmtDate(e.lastReceived)}` : "Inga betalningar än"}
        />
        <FinanceStat
          label="Att få in"
          value={SEK(due)}
          color="amber"
          hint={dueHint}
          note={e.overdue > 0 ? { text: `${SEK(e.overdue)} har förfallit`, tone: "red" } : undefined}
        />
        <FinanceStat
          label="Betalt totalt"
          value={SEK(e.receivedTotal)}
          color="teal"
          hint={e.invoiceCount ? plural(e.invoiceCount, "faktura", "fakturor") : "Inga fakturor än"}
        />
      </div>

      <Section title="Kunduppgifter" right={<Chip tone={status.tone}>{status.label}</Chip>}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Kontaktperson">
            {customer.contact_person ?? "—"}
            {customer.contact_role && <span className="text-[var(--muted)]"> · {customer.contact_role}</span>}
          </Field>
          <Field label="E-post">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="hover:text-teal-300 break-all">
                {customer.email}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Telefon">
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="hover:text-teal-300">
                {customer.phone}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Webbplats">
            {customer.website ? (
              <a
                href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                target="_blank"
                rel="noreferrer"
                className="text-teal-400 hover:underline break-all"
              >
                {customer.website}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Org.nr">
            {customer.org_number ? <span className="font-mono">{customer.org_number}</span> : <Missing />}
          </Field>
          <Field label="Adress">{customer.address ?? <Missing />}</Field>
          <Field label="Bransch">{customer.industry ?? "—"}</Field>
          <Field label="Tillagd">{fmtDate(customer.created_at)}</Field>
          {customer.notes && (
            <div className="sm:col-span-2 xl:col-span-4">
              <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">Anteckningar</dt>
              <dd className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{customer.notes}</dd>
            </div>
          )}
        </dl>
      </Section>

      <Section
        title="Återkommande intäkter & fakturering"
        hint="Prenumerationer och avtal för kunden."
        right={
          <>
            {e.monthly > 0 && (
              <span className="text-xs text-[var(--muted)] font-mono">{SEK(Math.round(e.monthly))}/mån</span>
            )}
            <NewRecurringIncomeButton preset={{ customerId: id }} label="Ny plan" variant="small" />
          </>
        }
      >
        <RecurringIncomeTable
          rows={plans}
          customers={customerList}
          agreements={agreementList}
          invoices={invoices.filter((r) => r.recurring_income_id)}
          linkCustomers={false}
          emptyText="Ingen återkommande fakturering för kunden än."
        />
      </Section>

      <Section
        title="Fakturor"
        hint="Betalda, obetalda och förfallna fakturor."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value === "all" ? customerEconomyHref(id) : `${customerEconomyHref(id)}?status=${f.value}`}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === f.value
                    ? "bg-white/10 border-white/20 text-white"
                    : "border-white/10 text-[var(--muted)] hover:text-white hover:bg-white/5"
                }`}
              >
                {f.label} <span className="text-[var(--muted)]">{counts[f.value]}</span>
              </Link>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Nr</th>
              <th className="p-3">Period</th>
              <th className="p-3">Fakturadatum</th>
              <th className="p-3">Förfaller</th>
              <th className="p-3 text-right">Belopp</th>
              <th className="p-3">Status</th>
              <th className="p-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {shown.map((r) => {
              const payment = paymentState(r, today);
              return (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/admin/invoices/${r.id}`}
                        className="font-mono text-xs font-semibold hover:text-teal-300"
                      >
                        {r.number}
                      </Link>
                      {r.credited_invoice_id && (
                        <span className="text-[10px] uppercase tracking-wider text-orange-300">Kredit</span>
                      )}
                      {r.recurring_income_id && (
                        <span title="Skapad av återkommande fakturering" className="text-teal-300">
                          <Repeat size={12} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--muted)]">
                    {r.period_start && r.period_end ? periodName({ start: r.period_start, end: r.period_end }) : "—"}
                  </td>
                  <td className="p-3 text-[var(--muted)]">{fmtDate(r.issued_at)}</td>
                  <td className="p-3 text-[var(--muted)]">{r.credited_invoice_id ? "—" : fmtDate(r.due_date)}</td>
                  <td className="p-3 text-right font-mono text-xs">
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
                    {payment && <div className={`text-[11px] mt-0.5 ${PAYMENT_TONE[payment.tone]}`}>{payment.text}</div>}
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/invoices/${r.id}`} className="text-[var(--muted)] hover:text-white">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                  {invoices.length ? "Inga fakturor matchar filtret." : "Inga fakturor till kunden än."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        title="Intäkter"
        hint="Pengar in från kunden. Bekräfta en intäkt när pengarna har kommit in."
        right={
          <NewIncomeButton
            customers={customerList}
            projects={projectList}
            bankAccounts={bankList}
            customerId={id}
            variant="small"
          />
        }
      >
        <IncomeTable
          rows={income}
          customers={customerList}
          projects={projectList}
          bankAccounts={bankList}
          invoiceNumbers={invoiceNumbers}
          showCustomer={false}
          emptyText="Inga intäkter från kunden än."
        />
      </Section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Missing() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-300">
      <AlertTriangle size={11} /> Saknas (krävs för fakturor och avtal)
    </span>
  );
}

const PAYMENT_TONE = {
  muted: "text-[var(--muted)]",
  green: "text-emerald-300/80",
  amber: "text-amber-300",
  red: "text-rose-300",
};

function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

// Raden under statuschipet: när fakturan betalades eller hur länge det är kvar
// till (eller sedan) förfallodagen.
function paymentState(
  r: InvoiceRow,
  today: string,
): { text: string; tone: keyof typeof PAYMENT_TONE } | null {
  if (r.credited_invoice_id) return null;
  if (r.status === "paid") return r.paid_at ? { text: `Betald ${fmtDate(r.paid_at)}`, tone: "green" } : null;
  if (!isOutstanding(r) || !r.due_date) return null;
  const days = daysBetween(today, r.due_date);
  if (effectiveStatus(r, today) === "overdue") {
    return { text: `${plural(-days, "dag", "dagar")} försenad`, tone: "red" };
  }
  if (days === 0) return { text: "Förfaller i dag", tone: "amber" };
  return { text: `Förfaller om ${plural(days, "dag", "dagar")}`, tone: "muted" };
}

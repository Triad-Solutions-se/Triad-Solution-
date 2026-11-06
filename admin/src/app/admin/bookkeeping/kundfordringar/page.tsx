import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/Chip";
import { ACC, money, ore } from "@/lib/accounting/core";
import { loadQueue } from "@/lib/accounting/data";
import { AGE_BUCKETS, ageBucket, balances } from "@/lib/accounting/reports";
import { fmtDate } from "@/lib/date";
import { isOutstanding } from "@/lib/invoice";
import { FinanceStat, Section } from "../../finance/FinanceBlocks";
import { NotReady } from "../NotReady";

export const dynamic = "force-dynamic";

const kr = (n: number) => `${money(n)} kr`;

/** Bokfört saldo jämfört med registret. Skillnaden ska förklaras av kön. */
function Reconcile({ label, ledger, register, waiting }: { label: string; ledger: number; register: number; waiting: number }) {
  const diff = (ore(register) - ore(ledger)) / 100;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/5 px-5 py-2 text-xs text-[var(--muted)]">
      <span>Bokfört på {label}: <span className="font-mono">{kr(ledger)}</span></span>
      <span>Enligt registret: <span className="font-mono">{kr(register)}</span></span>
      {diff === 0 ? (
        <span className="ml-auto flex items-center gap-1 text-emerald-300">
          <CheckCircle2 size={13} /> Stämmer
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-1 text-amber-300">
          <AlertTriangle size={13} /> Skiljer {kr(diff)}
          {waiting > 0 && ` (${waiting} i kön)`}
        </span>
      )}
    </div>
  );
}

export default async function ReceivablesPage() {
  const supabase = await createClient();
  const data = await loadQueue(supabase);
  if (!data) return <NotReady />;

  const ledger = balances(data.ledger.posted);
  const sumRange = (from: number, to: number, sign: 1 | -1) =>
    [...ledger].reduce((s, [a, v]) => (a >= from && a <= to ? s + ore(sign * v) : s), 0) / 100;
  const ledgerReceivables = sumRange(1510, 1519, 1);
  const ledgerPayables = sumRange(2440, 2449, -1);
  const ownerDebt = sumRange(ACC.OWNER_DEBT, ACC.OWNER_DEBT, -1);

  // Kundfordringar: skickade, obetalda fakturor från bokföringsstarten.
  const open = data.invoices
    .filter((i) => isOutstanding(i) && (i.issued_at ?? "") >= data.settings.start_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const bucketTotals = AGE_BUCKETS.map(() => 0);
  const byCustomer = new Map<string, { total: number; overdue: number; count: number }>();
  for (const inv of open) {
    const amount = ore(inv.amount_sek);
    const bucket = ageBucket(inv.due_date, data.today);
    bucketTotals[bucket] += amount;
    const name = inv.customer_name ?? "Okänd kund";
    const row = byCustomer.get(name) ?? { total: 0, overdue: 0, count: 0 };
    row.total += amount;
    row.count += 1;
    if (bucket > 0) row.overdue += amount;
    byCustomer.set(name, row);
  }
  const totalOpen = bucketTotals.reduce((s, v) => s + v, 0) / 100;
  const overdueTotal = bucketTotals.slice(1).reduce((s, v) => s + v, 0) / 100;
  const invoiceQueue = data.proposals.filter((p) => p.key.startsWith("invoice") || p.link?.type === "invoice").length;

  // Leverantörsskulder: betalningar på Ekonomi som inte är betalda.
  const unpaid = data.payments
    .filter((p) => p.status !== "paid" && p.created_at.slice(0, 10) >= data.settings.start_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const totalUnpaid = unpaid.reduce((s, p) => s + ore(p.amount_sek), 0) / 100;
  const payableQueue = data.proposals.filter((p) => p.key.startsWith("payment") || p.link?.type === "payment").length;

  // Utlägg som ska tillbaka till den som betalade.
  const pendingExpenses = data.expenses.filter(
    (e) => e.status !== "reimbursed" && (e.date ?? e.created_at.slice(0, 10)) >= data.settings.start_date,
  );
  const expenseQueue = data.proposals.filter((p) => p.group === "expense").length;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStat
          label="Kundfordringar"
          value={kr(totalOpen)}
          color="teal"
          hint={open.length === 1 ? "1 obetald faktura" : `${open.length} obetalda fakturor`}
          note={overdueTotal > 0 ? { text: `${kr(overdueTotal)} har förfallit`, tone: "red" } : undefined}
        />
        <FinanceStat
          label="Leverantörsskulder"
          value={kr(totalUnpaid)}
          color="red"
          hint={unpaid.length === 1 ? "1 obetald faktura" : `${unpaid.length} obetalda fakturor`}
        />
        <FinanceStat
          label="Skuld till ägare"
          value={kr(ownerDebt)}
          color="amber"
          hint="Utlägg som inte är återbetalda (2893)"
          note={expenseQueue > 0 ? { text: `${expenseQueue} utlägg väntar i kön`, tone: "amber" } : undefined}
        />
      </div>

      <Section title="Kundfordringar" hint="Åldersanalys av skickade fakturor som inte är betalda.">
        <Reconcile label="1510" ledger={ledgerReceivables} register={totalOpen} waiting={invoiceQueue} />
        <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-5">
          {AGE_BUCKETS.map((label, i) => (
            <div key={label} className="bg-[var(--surface)] p-3">
              <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
              <div className={`mt-1 font-mono text-sm tabular-nums ${i > 0 && bucketTotals[i] ? "text-rose-300" : ""}`}>
                {money(bucketTotals[i] / 100)}
              </div>
            </div>
          ))}
        </div>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="p-3">Faktura</th>
              <th className="p-3">Kund</th>
              <th className="p-3">Förfaller</th>
              <th className="p-3">Ålder</th>
              <th className="p-3 text-right">Belopp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {open.map((inv) => {
              const bucket = ageBucket(inv.due_date, data.today);
              return (
                <tr key={inv.id} className="transition-colors hover:bg-white/[0.04]">
                  <td className="p-3 font-mono">
                    <Link href={`/admin/invoices/${inv.id}`} className="hover:text-teal-300">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="p-3 text-[var(--muted)]">{inv.customer_name ?? "—"}</td>
                  <td className="whitespace-nowrap p-3 text-[var(--muted)]">{fmtDate(inv.due_date)}</td>
                  <td className="p-3">
                    <Chip tone={bucket === 0 ? "gray" : "red"}>{AGE_BUCKETS[bucket]}</Chip>
                  </td>
                  <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{money(inv.amount_sek)}</td>
                </tr>
              );
            })}
            {!open.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga obetalda kundfakturor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {byCustomer.size > 1 && (
        <Section title="Per kund">
          <table className="w-full min-w-[480px] text-sm">
            <tbody className="divide-y divide-white/5">
              {[...byCustomer]
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([name, r]) => (
                  <tr key={name}>
                    <td className="p-3">{name}</td>
                    <td className="p-3 text-[var(--muted)]">{r.count} st</td>
                    <td className={`whitespace-nowrap p-3 text-right font-mono tabular-nums ${r.overdue ? "text-rose-300" : "text-[var(--muted)]"}`}>
                      {r.overdue ? `${money(r.overdue / 100)} förfallet` : ""}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{money(r.total / 100)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Leverantörsskulder" hint="Räkningar under Betalningar på Ekonomi som inte är betalda.">
        <Reconcile label="2440" ledger={ledgerPayables} register={totalUnpaid} waiting={payableQueue} />
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="p-3">Leverantör / text</th>
              <th className="p-3">Förfaller</th>
              <th className="p-3 text-right">Belopp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {unpaid.map((p) => (
              <tr key={p.id}>
                <td className="p-3">{p.description}</td>
                <td className="whitespace-nowrap p-3 text-[var(--muted)]">{fmtDate(p.due_date)}</td>
                <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{money(p.amount_sek)}</td>
              </tr>
            ))}
            {!unpaid.length && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-[var(--muted)]">
                  Inga obetalda leverantörsfakturor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {pendingExpenses.length > 0 && (
        <Section title="Utlägg att återbetala" hint="Registrerade under Utlägg på Ekonomi.">
          <table className="w-full min-w-[480px] text-sm">
            <tbody className="divide-y divide-white/5">
              {pendingExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-[var(--muted)]">{e.paid_by ?? "—"}</td>
                  <td className="whitespace-nowrap p-3 text-[var(--muted)]">{fmtDate(e.date)}</td>
                  <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{money(e.amount_sek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}

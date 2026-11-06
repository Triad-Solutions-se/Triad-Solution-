import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { loadQueue, selectFiscalYear } from "@/lib/accounting/data";
import { balances, ledgerStats } from "@/lib/accounting/reports";
import { money, ore } from "@/lib/accounting/core";
import { fiscalYearLabel } from "@/lib/accounting/periods";
import { ApprovalQueue } from "./ApprovalQueue";
import { NotReady } from "./NotReady";

export const dynamic = "force-dynamic";

const kr = (n: number) => `${money(n)} kr`;

function MiniStat({ label, value, tone, hint }: { label: string; value: string; tone: string; hint: string }) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 font-heading text-base font-bold tabular-nums sm:text-lg ${tone}`}>{value}</div>
      <div className="truncate text-[11px] text-[var(--muted)]" title={hint}>
        {hint}
      </div>
    </div>
  );
}

export default async function BookkeepingPage() {
  const supabase = await createClient();
  const data = await loadQueue(supabase);
  if (!data) return <NotReady />;

  const fy = selectFiscalYear(data.fiscalYears, undefined, data.today);
  const stats = ledgerStats(
    data.ledger.posted,
    data.ledger.closingIds,
    data.ledger.reversalIds,
    fy?.start_date ?? "0000-01-01",
    fy?.end_date ?? "9999-12-31",
  );
  const periodLabel = fy ? `Räkenskapsår ${fiscalYearLabel(fy)}` : "";

  // Bankavstämning: bokfört saldo + det som väntar i kön ska bli bankens saldo.
  const ledgerBalances = balances(data.ledger.posted);
  const notBooked = new Map<string, number>();
  for (const p of [...data.proposals, ...data.ignored]) {
    if (!p.transactionId) continue;
    const tx = data.transactions.find((t) => t.id === p.transactionId);
    if (tx) notBooked.set(tx.bank_account_id, (notBooked.get(tx.bank_account_id) ?? 0) + ore(p.amount));
  }
  const reserved = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.status === "PDNG") reserved.set(t.bank_account_id, (reserved.get(t.bank_account_id) ?? 0) + ore(t.amount));
  }
  const reconciliation = data.bankAccounts
    .filter((b) => b.connection_id && b.synced_balance != null)
    .map((b) => {
      const ledgerAccount = b.ledger_account ?? 1930;
      const booked = ledgerBalances.get(ledgerAccount) ?? 0;
      const waiting = (notBooked.get(b.id) ?? 0) / 100;
      const pending = (reserved.get(b.id) ?? 0) / 100;
      const difference = (ore(b.synced_balance) - ore(booked) - ore(waiting) - ore(pending)) / 100;
      return { id: b.id, name: b.name, ledgerAccount, bank: Number(b.synced_balance), booked, waiting, pending, difference };
    });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Inbetalningar" value={kr(stats.inflow)} tone="text-emerald-300" hint={periodLabel} />
        <MiniStat label="Utbetalningar" value={kr(stats.outflow)} tone="text-rose-300" hint={periodLabel} />
        <MiniStat label="Utgående moms" value={kr(stats.outputVat)} tone="text-amber-300" hint="Försäljning + omvänd moms" />
        <MiniStat
          label="Ingående moms"
          value={kr(stats.inputVat)}
          tone="text-sky-300"
          hint={
            stats.vatDue !== 0
              ? `${stats.vatDue > 0 ? "Att betala" : "Att få tillbaka"}: ${kr(Math.abs(stats.vatDue))}`
              : "Att dra av"
          }
        />
        <MiniStat
          label="Kundfordringar"
          value={kr(stats.receivables)}
          tone="text-teal-300"
          hint={stats.payables > 0 ? `Leverantörsskulder: ${kr(stats.payables)}` : "Bokfört, obetalt"}
        />
      </div>

      {reconciliation.map((r) => (
        <div
          key={r.id}
          className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-btn border border-white/10 px-3 py-2 text-xs text-[var(--muted)]"
        >
          <span className="font-medium text-white">Bankavstämning {r.ledgerAccount}</span>
          <span>{r.name}: <span className="font-mono">{kr(r.bank)}</span></span>
          <span>Bokfört: <span className="font-mono">{kr(r.booked)}</span></span>
          <span>Väntar i kön: <span className="font-mono">{kr(r.waiting)}</span></span>
          {r.pending !== 0 && <span>Reserverat: <span className="font-mono">{kr(r.pending)}</span></span>}
          {r.difference === 0 ? (
            <span className="ml-auto flex items-center gap-1 text-emerald-300">
              <CheckCircle2 size={13} /> Stämmer
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-amber-300">
              <AlertTriangle size={13} /> Skiljer {kr(r.difference)}
            </span>
          )}
        </div>
      ))}

      {data.stale.length > 0 && (
        <div role="alert" className="mb-4 rounded-btn border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-amber-300">
            <AlertTriangle size={14} /> Underlag har ändrats efter bokföring
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {data.stale.map((s) => (
              <li key={s.key}>
                <Link href={`/admin/bookkeeping/verifikationer/${s.entryId}`} className="hover:text-teal-300">
                  {s.reason}
                </Link>{" "}
                Gör en rättelse så kommer posten tillbaka i kön.
              </li>
            ))}
          </ul>
        </div>
      )}

      <ApprovalQueue proposals={data.proposals} ignored={data.ignored} accounts={data.accounts} />

      {data.skipped.length > 0 && (
        <details className="mt-6 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">
            {data.skipped.length === 1 ? "1 underlag föreslås inte" : `${data.skipped.length} underlag föreslås inte`} (bokföringen
            startar {data.settings.start_date})
          </summary>
          <ul className="mt-2 space-y-0.5">
            {data.skipped.map((s) => (
              <li key={s.key}>
                {s.title}: {s.reason.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Ändra startdatumet under{" "}
            <Link href="/admin/bookkeeping/installningar" className="underline hover:text-white">
              Inställningar
            </Link>{" "}
            eller bokför dem med en manuell verifikation.
          </p>
        </details>
      )}
    </>
  );
}

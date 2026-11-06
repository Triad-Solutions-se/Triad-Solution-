import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/Chip";
import { loadAccounts, loadFiscalYears, loadLedger, loadSettings, selectFiscalYear } from "@/lib/accounting/data";
import { money } from "@/lib/accounting/core";
import { todayISO } from "@/lib/invoice";
import { fmtDate } from "@/lib/date";
import { Section } from "../../finance/FinanceBlocks";
import { NotReady } from "../NotReady";
import { FiscalYearSelect } from "../parts";
import { NewEntryButton } from "./NewEntryButton";

export const dynamic = "force-dynamic";

export default async function EntriesPage({ searchParams }: { searchParams: Promise<{ ar?: string; q?: string }> }) {
  const { ar, q } = await searchParams;
  const supabase = await createClient();
  const settings = await loadSettings(supabase);
  if (!settings) return <NotReady />;
  const [years, accounts, ledger] = await Promise.all([
    loadFiscalYears(supabase),
    loadAccounts(supabase),
    loadLedger(supabase),
  ]);
  const today = todayISO();
  const fy = selectFiscalYear(years, ar, today);
  const search = (q ?? "").trim().toLowerCase();
  const reversedBy = new Map(
    ledger.entries.filter((e) => e.reverses_entry_id).map((e) => [e.reverses_entry_id as string, e]),
  );
  const totals = new Map<string, number>();
  const accountsByEntry = new Map<string, Set<number>>();
  for (const l of ledger.lines) {
    totals.set(l.entry_id, (totals.get(l.entry_id) ?? 0) + Number(l.debit));
    const set = accountsByEntry.get(l.entry_id) ?? new Set<number>();
    set.add(l.account);
    accountsByEntry.set(l.entry_id, set);
  }
  const rows = ledger.entries
    .filter((e) => (fy ? e.fiscal_year_id === fy.id : true))
    .filter((e) => {
      if (!search) return true;
      const accts = [...(accountsByEntry.get(e.id) ?? [])].join(" ");
      return `${e.series}${e.number} ${e.description} ${accts}`.toLowerCase().includes(search);
    })
    .sort((a, b) => b.number - a.number);

  return (
    <Section
      title="Verifikationer"
      hint="I den ordning de registrerats. Numren är löpande och verifikationer kan inte ändras: fel rättas med en rättelse."
      right={
        <>
          <FiscalYearSelect years={years} value={fy?.id ?? null} />
          <NewEntryButton accounts={accounts} defaultDate={today} />
        </>
      }
    >
      <form className="border-b border-white/5 px-5 py-3">
        {fy && <input type="hidden" name="ar" value={fy.id} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Sök på nummer, text eller konto"
          aria-label="Sök verifikationer"
          className="w-full max-w-sm rounded-btn border border-white/10 bg-black/30 px-3 py-1.5 text-sm"
        />
      </form>
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
          <tr>
            <th className="p-3">Nr</th>
            <th className="p-3">Datum</th>
            <th className="p-3">Text</th>
            <th className="p-3">Konton</th>
            <th className="p-3 text-right">Belopp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((e) => {
            const reversal = reversedBy.get(e.id);
            return (
              <tr key={e.id} className="transition-colors hover:bg-white/[0.04]">
                <td className="whitespace-nowrap p-3 font-mono">
                  <Link href={`/admin/bookkeeping/verifikationer/${e.id}`} className="hover:text-teal-300">
                    {e.series}
                    {e.number}
                  </Link>
                </td>
                <td className="whitespace-nowrap p-3 text-[var(--muted)]">{fmtDate(e.date)}</td>
                <td className="p-3">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Link href={`/admin/bookkeeping/verifikationer/${e.id}`} className="hover:text-teal-300">
                      {e.description}
                    </Link>
                    {e.reverses_entry_id && <Chip tone="orange">Rättelse</Chip>}
                    {reversal && <Chip tone="gray">Rättad i {reversal.series}{reversal.number}</Chip>}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs text-[var(--muted)]">
                  {[...(accountsByEntry.get(e.id) ?? [])].join(", ")}
                </td>
                <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{money(totals.get(e.id) ?? 0)}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="p-8 text-center text-sm text-[var(--muted)]">
                {search ? "Inga verifikationer matchar sökningen." : "Inga verifikationer än. Godkänn poster i kön så hamnar de här."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

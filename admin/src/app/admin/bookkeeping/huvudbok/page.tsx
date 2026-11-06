import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isBalanceAccount, money, ore } from "@/lib/accounting/core";
import { loadAccounts, loadFiscalYears, loadLedger, loadSettings, selectFiscalYear } from "@/lib/accounting/data";
import { fmtDate } from "@/lib/date";
import { todayISO } from "@/lib/invoice";
import { Section } from "../../finance/FinanceBlocks";
import { NotReady } from "../NotReady";
import { FiscalYearSelect } from "../parts";

export const dynamic = "force-dynamic";

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ ar?: string; konto?: string }>;
}) {
  const { ar, konto } = await searchParams;
  const supabase = await createClient();
  const settings = await loadSettings(supabase);
  if (!settings) return <NotReady />;
  const [years, accounts, ledger] = await Promise.all([
    loadFiscalYears(supabase),
    loadAccounts(supabase),
    loadLedger(supabase),
  ]);
  const fy = selectFiscalYear(years, ar, todayISO());
  const names = new Map(accounts.map((a) => [a.number, a.name]));
  const entryById = new Map(ledger.entries.map((e) => [e.id, e]));
  const start = fy?.start_date ?? "0000-01-01";
  const end = fy?.end_date ?? "9999-12-31";

  // Ingående saldo: balanskonton bär med sig tidigare år, resultatkonton börjar på noll.
  const opening = new Map<number, number>();
  const byAccount = new Map<number, typeof ledger.posted>();
  for (const l of ledger.posted) {
    if (l.date < start) {
      if (isBalanceAccount(l.account)) {
        opening.set(l.account, (opening.get(l.account) ?? 0) + ore(l.debit) - ore(l.credit));
      }
    } else if (l.date <= end) {
      const list = byAccount.get(l.account);
      if (list) list.push(l);
      else byAccount.set(l.account, [l]);
    }
  }
  const numbers = [...new Set([...byAccount.keys(), ...opening.keys()])].sort((a, b) => a - b);
  const focus = Number(konto);

  return (
    <Section
      title="Huvudbok"
      hint="Alla konton med rörelser under året. Öppna ett konto för raderna och löpande saldo."
      right={<FiscalYearSelect years={years} value={fy?.id ?? null} />}
    >
      <div className="divide-y divide-white/5">
        {numbers.map((number) => {
          const rows = (byAccount.get(number) ?? []).sort((a, b) => {
            const ea = entryById.get(a.entry_id)!;
            const eb = entryById.get(b.entry_id)!;
            return a.date.localeCompare(b.date) || ea.number - eb.number || a.line_no - b.line_no;
          });
          const openingOre = opening.get(number) ?? 0;
          let running = openingOre;
          const debit = rows.reduce((s, l) => s + ore(l.debit), 0);
          const credit = rows.reduce((s, l) => s + ore(l.credit), 0);
          const closing = openingOre + debit - credit;
          return (
            <details key={number} id={`k${number}`} open={focus === number} className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-white/[0.04]">
                <span className="font-mono">{number}</span>
                <span className="min-w-0 flex-1">{names.get(number) ?? `Konto ${number}`}</span>
                <span className="text-xs text-[var(--muted)]">
                  {rows.length} {rows.length === 1 ? "rad" : "rader"}
                </span>
                <span className="w-32 text-right font-mono tabular-nums">{money(closing / 100)}</span>
              </summary>
              <div className="overflow-x-auto bg-black/10">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="text-left text-[var(--muted)]">
                    <tr>
                      <th className="px-5 py-2">Ver</th>
                      <th className="px-3 py-2">Datum</th>
                      <th className="px-3 py-2">Text</th>
                      <th className="px-3 py-2 text-right">Debet</th>
                      <th className="px-3 py-2 text-right">Kredit</th>
                      <th className="px-5 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isBalanceAccount(number) && (
                      <tr>
                        <td className="px-5 py-2" />
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-[var(--muted)]">Ingående balans</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />
                        <td className="px-5 py-2 text-right font-mono tabular-nums">{money(openingOre / 100)}</td>
                      </tr>
                    )}
                    {rows.map((l) => {
                      const e = entryById.get(l.entry_id)!;
                      running += ore(l.debit) - ore(l.credit);
                      return (
                        <tr key={`${l.entry_id}-${l.line_no}`}>
                          <td className="px-5 py-2 font-mono">
                            <Link href={`/admin/bookkeeping/verifikationer/${e.id}`} className="hover:text-teal-300">
                              {e.series}
                              {e.number}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{fmtDate(l.date)}</td>
                          <td className="px-3 py-2">{e.description}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                          <td className="px-5 py-2 text-right font-mono tabular-nums">{money(running / 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {!numbers.length && (
          <p className="p-8 text-center text-sm text-[var(--muted)]">Inget bokfört under året.</p>
        )}
      </div>
    </Section>
  );
}

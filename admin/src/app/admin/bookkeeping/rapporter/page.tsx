import { Fragment } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/accounting/core";
import { loadAccounts, loadFiscalYears, loadLedger, loadSettings, selectFiscalYear } from "@/lib/accounting/data";
import { fiscalYearLabel } from "@/lib/accounting/periods";
import { type ReportRow, balanceSheet, balances, incomeStatement, resultOf } from "@/lib/accounting/reports";
import { todayISO } from "@/lib/invoice";
import { Section } from "../../finance/FinanceBlocks";
import { NEW_BUTTON_CLS } from "../../finance/button-styles";
import { NotReady } from "../NotReady";
import { FiscalYearSelect } from "../parts";

export const dynamic = "force-dynamic";

function Rows({ rows }: { rows: ReportRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.account}>
          <td className="py-1.5 pl-5 pr-3 font-mono text-xs text-[var(--muted)]">{r.account}</td>
          <td className="px-3 py-1.5">{r.name}</td>
          <td className="py-1.5 pl-3 pr-5 text-right font-mono tabular-nums">{money(r.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function Subtotal({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={`border-t border-white/10 ${strong ? "font-semibold" : "font-medium"}`}>
      <td className="py-2 pl-5 pr-3" colSpan={2}>
        {label}
      </td>
      <td className="py-2 pl-3 pr-5 text-right font-mono tabular-nums">{money(value)}</td>
    </tr>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <th colSpan={3} scope="colgroup" className="pb-1 pl-5 pt-4 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        {children}
      </th>
    </tr>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const { ar } = await searchParams;
  const supabase = await createClient();
  const settings = await loadSettings(supabase);
  if (!settings) return <NotReady />;
  const [years, accounts, ledger] = await Promise.all([
    loadFiscalYears(supabase),
    loadAccounts(supabase),
    loadLedger(supabase),
  ]);
  const fy = selectFiscalYear(years, ar, todayISO());
  const start = fy?.start_date ?? "0000-01-01";
  const end = fy?.end_date ?? "9999-12-31";

  const period = balances(ledger.posted.filter((l) => l.date >= start && l.date <= end));
  const cumulative = balances(ledger.posted.filter((l) => l.date <= end));
  const income = incomeStatement(period, accounts);
  const sheet = balanceSheet(cumulative, accounts, resultOf(cumulative));
  const earlierResult = Math.round((sheet.resultToDate - income.result) * 100) / 100;
  const label = fy ? fiscalYearLabel(fy) : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FiscalYearSelect years={years} value={fy?.id ?? null} />
        {fy && (
          <a href={`/admin/api/accounting/sie?ar=${fy.id}`} className={NEW_BUTTON_CLS.secondary}>
            <Download size={15} /> Exportera SIE 4
          </a>
        )}
      </div>

      {sheet.capitalShortfall && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-btn border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Eget kapital ({money(sheet.equity)} kr) är under hälften av aktiekapitalet ({money(sheet.shareCapital)} kr). Enligt
            aktiebolagslagen (25 kap. 13 §) ska styrelsen då genast upprätta en kontrollbalansräkning. Prata med er
            redovisningskonsult.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-6 xl:grid-cols-2">
        <Section title="Resultaträkning" hint={label}>
          <table className="w-full min-w-[420px] pb-2 text-sm">
            <tbody>
              {income.groups
                .filter((g) => g.rows.length)
                .map((g) => (
                  <Fragment key={g.label}>
                    <Heading>{g.label}</Heading>
                    <Rows rows={g.rows} />
                    <Subtotal label={`Summa ${g.label.toLowerCase()}`} value={g.total} />
                  </Fragment>
                ))}
              <Subtotal label="Årets resultat" value={income.result} strong />
            </tbody>
          </table>
        </Section>

        <Section title="Balansräkning" hint={fy ? `Per ${end}` : undefined}>
          <table className="w-full min-w-[420px] text-sm">
            <tbody>
              <Heading>Tillgångar</Heading>
              <Rows rows={sheet.assets} />
              <Subtotal label="Summa tillgångar" value={sheet.totalAssets} strong />
              <Heading>Eget kapital</Heading>
              <Rows rows={sheet.equityRows} />
              {earlierResult !== 0 && (
                <tr>
                  <td className="py-1.5 pl-5 pr-3" />
                  <td className="px-3 py-1.5">Resultat från tidigare år</td>
                  <td className="py-1.5 pl-3 pr-5 text-right font-mono tabular-nums">{money(earlierResult)}</td>
                </tr>
              )}
              <tr>
                <td className="py-1.5 pl-5 pr-3" />
                <td className="px-3 py-1.5">Årets resultat</td>
                <td className="py-1.5 pl-3 pr-5 text-right font-mono tabular-nums">{money(income.result)}</td>
              </tr>
              <Subtotal label="Summa eget kapital" value={sheet.equity} />
              <Heading>Skulder</Heading>
              <Rows rows={sheet.liabilities} />
              <Subtotal label="Summa skulder" value={sheet.totalLiabilities} />
              <Subtotal
                label="Summa eget kapital och skulder"
                value={Math.round((sheet.equity + sheet.totalLiabilities) * 100) / 100}
                strong
              />
            </tbody>
          </table>
          {!sheet.balanced && (
            <p role="alert" className="border-t border-white/5 px-5 py-3 text-xs text-rose-300">
              Balansräkningen går inte ihop. Kontakta den som underhåller portalen.
            </p>
          )}
        </Section>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Rapporterna är löpande och utan bokslutsposter (avskrivningar, periodiseringar, skatt). Årsbokslut och årsredovisning görs utifrån
        SIE-filen.
      </p>
    </>
  );
}

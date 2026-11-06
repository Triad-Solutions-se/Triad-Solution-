import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/Chip";
import { loadQueue } from "@/lib/accounting/data";
import { VAT_BOXES, vatReport } from "@/lib/accounting/reports";
import { money } from "@/lib/accounting/core";
import { fmtDate } from "@/lib/date";
import { FinanceStat, Section } from "../../finance/FinanceBlocks";
import { NotReady } from "../NotReady";
import { VatCloseButton } from "./VatCloseButton";

export const dynamic = "force-dynamic";

const wholeKr = (n: number) => `${new Intl.NumberFormat("sv-SE").format(n).replace(/−/g, "-")} kr`;

export default async function VatPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodId } = await searchParams;
  const supabase = await createClient();
  const data = await loadQueue(supabase);
  if (!data) return <NotReady />;

  const isClosed = (id: string) => data.decisions.some((d) => d.source_key === `vat-close:${id}`);
  // Förval: äldsta perioden som är slut men inte redovisad, annars den senaste.
  const finishedOpen = data.periods.find((p) => p.to < data.today && !isClosed(p.id));
  const period =
    data.periods.find((p) => p.id === periodId) ?? finishedOpen ?? data.periods[data.periods.length - 1] ?? null;

  if (!period) {
    return (
      <Section title="Moms">
        <p className="p-8 text-center text-sm text-[var(--muted)]">Inga momsperioder än.</p>
      </Section>
    );
  }

  const report = vatReport(data.ledger.posted, data.accounts, data.ledger.closingIds, period.from, period.to);
  const closed = isClosed(period.id);
  const finished = period.to < data.today;
  // Omföringen till skattekontot påverkar inte momsen och räknas inte som väntande.
  const waiting = data.proposals.filter(
    (p) => p.group !== "vat" && p.sourceDate >= period.from && p.sourceDate <= period.to,
  );
  const earlierOpen = data.periods.find((p) => p.to < period.to && !isClosed(p.id));
  const toPay = report.box49 > 0;
  const overdue = !closed && period.due != null && period.due < data.today;
  const dueSoon = !closed && !overdue && finished;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Momsperiod">
        {[...data.periods].reverse().map((p) => (
          <Link
            key={p.id}
            href={`/admin/bookkeeping/moms?period=${p.id}`}
            aria-current={p.id === period.id ? "true" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              p.id === period.id
                ? "border-teal-400/40 bg-teal-400/15 text-teal-200"
                : "border-white/10 text-[var(--muted)] hover:bg-white/5 hover:text-white"
            }`}
          >
            {p.label}
            {isClosed(p.id) && <CheckCircle2 size={12} className="text-emerald-300" />}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStat
          label={toPay ? "Moms att betala" : report.box49 < 0 ? "Moms att få tillbaka" : "Moms"}
          value={wholeKr(Math.abs(report.box49))}
          color={toPay ? "amber" : "green"}
          hint={`Ruta 49, ${period.label}`}
        />
        <FinanceStat
          label="Sista dag"
          value={period.due ? fmtDate(period.due) : "Se Skatteverket"}
          color={overdue ? "red" : "blue"}
          hint={period.due ? "Deklarerad och betald" : "Helår: beror på EU-handel och hur ni deklarerar"}
          note={overdue ? { text: "Datumet har passerat", tone: "red" } : dueSoon ? { text: "Perioden är slut", tone: "amber" } : undefined}
        />
        <FinanceStat
          label="Status"
          value={closed ? "Redovisad" : finished ? "Att redovisa" : "Pågår"}
          color={closed ? "green" : "teal"}
          hint={closed ? "Perioden är låst" : `${fmtDate(period.from)} – ${fmtDate(period.to)}`}
        />
      </div>

      {waiting.length > 0 && !closed && (
        <p role="alert" className="mb-4 flex items-start gap-1.5 rounded-btn border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {waiting.length === 1 ? "1 post" : `${waiting.length} poster`} från perioden väntar på godkännande och räknas inte in
            ännu.{" "}
            <Link href="/admin/bookkeeping" className="underline hover:text-white">
              Gå till kön
            </Link>
          </span>
        </p>
      )}
      {report.needsEcSalesList && (
        <p className="mb-4 flex items-start gap-1.5 rounded-btn border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm text-sky-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Ni har försäljning till andra EU-länder i perioden: den ska också redovisas i en periodisk sammanställning hos
          Skatteverket.
        </p>
      )}

      <Section
        title={`Momsdeklaration ${period.label}`}
        hint="Fyll i de här rutorna hos Skatteverket. Ören faller bort i deklarationen och bokförs på 3740 vid avslutet."
        right={
          closed ? (
            <Chip tone="green">Redovisad</Chip>
          ) : (
            <VatCloseButton
              periodId={period.id}
              label={period.label}
              box49={report.box49}
              waiting={waiting.length}
              disabledReason={
                !finished ? "Perioden är inte slut än" : earlierOpen ? `Redovisa ${earlierOpen.label} först` : null
              }
            />
          )
        }
      >
        <table className="w-full min-w-[520px] text-sm">
          <tbody className="divide-y divide-white/5">
            {VAT_BOXES.flatMap((g) => {
              const rows = g.boxes.filter((b) => (report.exact[b.box] ?? 0) !== 0);
              if (!rows.length) return [];
              return [
                <tr key={g.group} className="bg-white/[0.03]">
                  <th colSpan={3} scope="colgroup" className="p-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    {g.group}
                  </th>
                </tr>,
                ...rows.map((b) => (
                  <tr key={b.box}>
                    <td className="w-14 p-3 font-mono text-[var(--muted)]">{b.box}</td>
                    <td className="p-3">{b.label}</td>
                    <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">
                      {wholeKr(report.boxes[b.box] ?? 0)}
                    </td>
                  </tr>
                )),
              ];
            })}
            <tr className="font-semibold">
              <td className="p-3 font-mono">49</td>
              <td className="p-3">{toPay ? "Moms att betala" : report.box49 < 0 ? "Moms att få tillbaka" : "Moms att betala eller få tillbaka"}</td>
              <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">{wholeKr(report.box49)}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-white/5 px-5 py-3 text-xs text-[var(--muted)]">
          Exakt moms enligt bokföringen: {money(report.exactPayable)} kr.
        </p>
      </Section>
    </>
  );
}

"use client";
// Intäkter per kund på Ekonomi-sidan: en rad per kund med intäkter, fakturor
// eller återkommande planer. Raden öppnar kundsidan (fakturor, betalt/obetalt,
// planer och intäkter). Intäkter utan kund fälls ut under en egen rad.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/date";
import { type CustomerEconomy, customerEconomyHref, toReceive } from "@/lib/customer";
import { type Income, IncomeTable } from "./IncomeSection";

type Opt = { id: string; name: string };
export type CustomerIncomeRow = CustomerEconomy & { id: string; name: string };

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CustomerIncomeTable({
  rows,
  unassigned,
  unassignedEconomy,
  customers,
  projects,
  bankAccounts,
  invoiceNumbers,
}: {
  rows: CustomerIncomeRow[];
  // Intäktsrader utan kund och deras summering.
  unassigned: Income[];
  unassignedEconomy: CustomerEconomy | null;
  customers: Opt[];
  projects: Opt[];
  bankAccounts: Opt[];
  invoiceNumbers: Record<string, string>;
}) {
  const router = useRouter();
  const [showUnassigned, setShowUnassigned] = useState(false);
  return (
    <table className="w-full text-sm min-w-[680px]">
      <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
        <tr>
          <th className="p-3">Kund</th>
          <th className="p-3">Återkommande</th>
          <th className="p-3">Mottaget i år</th>
          <th className="p-3">Att få in</th>
          <th className="p-3">Senast betalt</th>
          <th className="p-3 w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {rows.map((r) => {
          const href = customerEconomyHref(r.id);
          const details = [
            r.invoiceCount ? plural(r.invoiceCount, "faktura", "fakturor") : null,
            r.activePlans ? plural(r.activePlans, "aktiv plan", "aktiva planer") : null,
          ].filter(Boolean);
          return (
            <tr
              key={r.id}
              onClick={() => router.push(href)}
              className="hover:bg-white/[0.04] cursor-pointer transition-colors"
            >
              <td className="p-3">
                <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-teal-300">
                  {r.name}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  {details.join(" · ") || "Bara intäkter"}
                  {r.pendingCount > 0 && (
                    <span className="text-amber-300"> · {r.pendingCount} att bekräfta</span>
                  )}
                </div>
              </td>
              <EconomyCells e={r} />
              <td className="p-3 text-[var(--muted)]">
                <ChevronRight size={16} />
              </td>
            </tr>
          );
        })}
        {unassigned.length > 0 && unassignedEconomy && (
          <tr
            onClick={() => setShowUnassigned((v) => !v)}
            className="hover:bg-white/[0.04] cursor-pointer transition-colors"
            aria-expanded={showUnassigned}
          >
            <td className="p-3">
              <div className="font-medium text-[var(--muted)]">Utan kund</div>
              <div className="text-xs text-[var(--muted)]">
                {plural(unassigned.length, "intäkt", "intäkter")}
                {unassignedEconomy.pendingCount > 0 && (
                  <span className="text-amber-300"> · {unassignedEconomy.pendingCount} att bekräfta</span>
                )}
              </div>
            </td>
            <EconomyCells e={unassignedEconomy} />
            <td className="p-3 text-[var(--muted)]">
              {showUnassigned ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </td>
          </tr>
        )}
        {showUnassigned && unassigned.length > 0 && (
          <tr>
            <td colSpan={6} className="p-0 bg-black/10">
              <IncomeTable
                rows={unassigned}
                customers={customers}
                projects={projects}
                bankAccounts={bankAccounts}
                invoiceNumbers={invoiceNumbers}
                showCustomer={false}
              />
            </td>
          </tr>
        )}
        {!rows.length && !unassigned.length && (
          <tr>
            <td colSpan={6} className="p-8 text-center text-sm text-[var(--muted)]">
              Inga intäkter än.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function EconomyCells({ e }: { e: CustomerEconomy }) {
  const due = toReceive(e);
  return (
    <>
      <td className="p-3 font-mono">
        {e.monthly > 0 ? (
          <span className="text-sky-300">{SEK(Math.round(e.monthly))}/mån</span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="p-3 font-mono">
        {e.receivedYear ? SEK(e.receivedYear) : <span className="text-[var(--muted)]">—</span>}
      </td>
      <td className="p-3 font-mono">
        {due ? (
          <>
            <div className="text-amber-300">{SEK(due)}</div>
            {e.overdue > 0 && <div className="text-xs text-rose-300">varav {SEK(e.overdue)} förfallet</div>}
          </>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="p-3 text-[var(--muted)]">{fmtDate(e.lastReceived)}</td>
    </>
  );
}

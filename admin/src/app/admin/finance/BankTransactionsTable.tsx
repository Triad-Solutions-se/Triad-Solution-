import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

export type BankTransaction = {
  id: string;
  bank_account_id: string;
  status: string;
  booking_date: string | null;
  amount: number | string;
  currency: string;
  counterparty: string | null;
  description: string | null;
};

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export function BankTransactionsTable({
  rows,
  accounts,
}: {
  rows: BankTransaction[];
  accounts: { id: string; name: string; color: string | null }[];
}) {
  const showAccount = new Set(rows.map((r) => r.bank_account_id)).size > 1;
  return (
    <table className="w-full text-sm min-w-[540px]">
      <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
        <tr>
          <th className="p-3">Datum</th>
          {showAccount && <th className="p-3">Konto</th>}
          <th className="p-3">Motpart / text</th>
          <th className="p-3 text-right">Belopp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {rows.map((r) => {
          const amount = Number(r.amount);
          const account = accounts.find((a) => a.id === r.bank_account_id);
          return (
            <tr key={r.id} className="hover:bg-white/[0.04] transition-colors">
              <td className="p-3 text-[var(--muted)] whitespace-nowrap">{fmtDate(r.booking_date)}</td>
              {showAccount && (
                <td className="p-3 text-[var(--muted)] whitespace-nowrap">
                  <span
                    className="inline-block h-2 w-2 rounded-full mr-2 align-middle"
                    style={{ background: account?.color ?? "#14b8a6" }}
                  />
                  {account?.name ?? "—"}
                </td>
              )}
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[28rem]">
                    {r.counterparty || r.description || "—"}
                  </span>
                  {r.status !== "BOOK" && <Chip tone="yellow">Reserverad</Chip>}
                </div>
                {r.counterparty && r.description && (
                  <div className="text-xs text-[var(--muted)] truncate max-w-[28rem]">{r.description}</div>
                )}
              </td>
              <td
                className={`p-3 text-right font-mono whitespace-nowrap ${
                  amount < 0 ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {amount > 0 ? "+" : ""}
                {money(amount, r.currency || "SEK")}
              </td>
            </tr>
          );
        })}
        {!rows.length && (
          <tr>
            <td colSpan={showAccount ? 4 : 3} className="p-8 text-center text-sm text-[var(--muted)]">
              Inga transaktioner från banken än.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

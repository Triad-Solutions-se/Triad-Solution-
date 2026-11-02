// Underlag till cashflow-diagrammet på Ekonomi.
//
// För bankkopplade konton är bankens bokförda transaktioner sanningen. Portalens
// egna poster (mottagna intäkter, återbetalda utlägg, betalda betalningar)
// räknas bara där banken inte redan ser pengarna: på konton som inte är
// kopplade, och före den dag bankhistoriken börjar. Annars räknas samma
// betalning två gånger.

export type CashflowTx = { date: string | null; amount_sek: number };

export type PortalCashRow = {
  date: string | null;
  amount_sek: number | string | null;
  bank_account_id: string | null;
};

export type BankCashRow = {
  bank_account_id: string;
  booking_date: string | null;
  amount: number | string;
};

export function buildCashflow(input: {
  /** Pengar in enligt portalen. */
  income: PortalCashRow[];
  /** Pengar ut enligt portalen (positiva belopp). */
  outgoing: PortalCashRow[];
  /** Bokförda transaktioner för de kopplade kontona (signerade belopp). */
  bankTx: BankCashRow[];
  /** Kopplat konto → första bokföringsdag i bankhistoriken (YYYY-MM-DD). */
  historyStart: Map<string, string>;
}): { income: CashflowTx[]; expenses: CashflowTx[] } {
  const starts = [...input.historyStart.values()].sort();
  // Poster utan konto antas ha gått via banken när de är från bankhistorikens tid.
  const earliest = starts[0] ?? null;

  const coveredByBank = (r: PortalCashRow) => {
    if (!r.date) return false;
    const start = r.bank_account_id ? input.historyStart.get(r.bank_account_id) : earliest;
    return start != null && r.date.slice(0, 10) >= start;
  };
  const portal = (rows: PortalCashRow[]) =>
    rows
      .filter((r) => !coveredByBank(r))
      .map((r) => ({ date: r.date, amount_sek: Number(r.amount_sek || 0) }));

  const income = portal(input.income);
  const expenses = portal(input.outgoing);
  for (const t of input.bankTx) {
    if (!input.historyStart.has(t.bank_account_id)) continue;
    const amount = Number(t.amount || 0);
    if (amount > 0) income.push({ date: t.booking_date, amount_sek: amount });
    else if (amount < 0) expenses.push({ date: t.booking_date, amount_sek: -amount });
  }
  return { income, expenses };
}

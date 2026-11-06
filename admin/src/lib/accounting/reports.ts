// Rapporter ur huvudboken: saldon, momsdeklaration, resultat- och balansräkning
// och åldersanalys. Ren fil.

import { ACC, type Account, type EntryLine, isBalanceAccount, ore, round2 } from "./core";

export type LedgerEntry = {
  id: string;
  fiscal_year_id: string;
  series: string;
  number: number;
  date: string;
  description: string;
  source_key: string | null;
  link_key: string | null;
  reverses_entry_id: string | null;
  attachment_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type LedgerLine = {
  entry_id: string;
  line_no: number;
  account: number;
  debit: number;
  credit: number;
  vat_box: string | null;
  note: string | null;
};

export type PostedLine = LedgerLine & { date: string };

/** Rader med verifikationens datum, sorterade på datum och nummer. */
export function postedLines(entries: LedgerEntry[], lines: LedgerLine[]): PostedLine[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return lines.flatMap((l) => {
    const e = byId.get(l.entry_id);
    return e ? [{ ...l, date: e.date }] : [];
  });
}

const VAT_CLOSE_PREFIX = "vat-close:";

/** Verifikationer som är själva momsavslutet, eller rättelser av ett momsavslut. */
export function vatClosingEntryIds(entries: LedgerEntry[]): Set<string> {
  const closing = new Set(entries.filter((e) => e.source_key?.startsWith(VAT_CLOSE_PREFIX)).map((e) => e.id));
  for (const e of entries) {
    if (e.reverses_entry_id && closing.has(e.reverses_entry_id)) closing.add(e.id);
  }
  return closing;
}

/** Rättelser och det de rättar. Tillsammans är de noll, men skulle blåsa upp bruttosummor. */
export function reversalPairIds(entries: LedgerEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.reverses_entry_id) {
      ids.add(e.id);
      ids.add(e.reverses_entry_id);
    }
  }
  return ids;
}

export function balances(lines: Pick<LedgerLine, "account" | "debit" | "credit">[]): Map<number, number> {
  const oreBy = new Map<number, number>();
  for (const l of lines) {
    oreBy.set(l.account, (oreBy.get(l.account) ?? 0) + ore(l.debit) - ore(l.credit));
  }
  return new Map([...oreBy].map(([a, v]) => [a, v / 100]));
}

// ---------- Moms -----------------------------------------------------------

/** Rutor i momsdeklarationen i blankettens ordning, med Skatteverkets rubriker. */
export const VAT_BOXES: { group: string; boxes: { box: string; label: string }[] }[] = [
  {
    group: "Momspliktig försäljning eller uttag exklusive moms",
    boxes: [
      { box: "05", label: "Momspliktig försäljning som inte ingår i fält 06, 07 eller 08" },
      { box: "06", label: "Momspliktiga uttag" },
      { box: "07", label: "Beskattningsunderlag vid vinstmarginalbeskattning" },
      { box: "08", label: "Hyresinkomster vid frivillig beskattning" },
    ],
  },
  {
    group: "Utgående moms på försäljning eller uttag",
    boxes: [
      { box: "10", label: "Utgående moms 25 %" },
      { box: "11", label: "Utgående moms 12 %" },
      { box: "12", label: "Utgående moms 6 %" },
    ],
  },
  {
    group: "Inköp vid omvänd betalningsskyldighet",
    boxes: [
      { box: "20", label: "Inköp av varor från annat EU-land" },
      { box: "21", label: "Inköp av tjänster från annat EU-land, enligt huvudregeln" },
      { box: "22", label: "Inköp av tjänster från land utanför EU" },
      { box: "23", label: "Inköp av varor i Sverige som köparen är betalningsskyldig för" },
      { box: "24", label: "Övriga inköp av tjänster i Sverige som köparen är betalningsskyldig för" },
    ],
  },
  {
    group: "Utgående moms på inköp",
    boxes: [
      { box: "30", label: "Utgående moms 25 %" },
      { box: "31", label: "Utgående moms 12 %" },
      { box: "32", label: "Utgående moms 6 %" },
    ],
  },
  {
    group: "Import",
    boxes: [
      { box: "50", label: "Beskattningsunderlag vid import" },
      { box: "60", label: "Utgående moms 25 %" },
      { box: "61", label: "Utgående moms 12 %" },
      { box: "62", label: "Utgående moms 6 %" },
    ],
  },
  {
    group: "Försäljning som är undantagen från moms",
    boxes: [
      { box: "35", label: "Försäljning av varor till annat EU-land" },
      { box: "36", label: "Försäljning av varor utanför EU" },
      { box: "37", label: "Mellanmans inköp av varor vid trepartshandel" },
      { box: "38", label: "Mellanmans försäljning av varor vid trepartshandel" },
      { box: "39", label: "Försäljning av tjänster till beskattningsbar person i annat EU-land, enligt huvudregeln" },
      { box: "40", label: "Övrig försäljning av tjänster som tillhandahållits utomlands" },
      { box: "41", label: "Försäljning när köparen är betalningsskyldig i Sverige" },
      { box: "42", label: "Övrig försäljning med mera" },
    ],
  },
  { group: "Ingående moms", boxes: [{ box: "48", label: "Ingående moms att dra av" }] },
];

const OUTPUT_VAT_BOXES = ["10", "11", "12", "30", "31", "32", "60", "61", "62"];
const INPUT_VAT_BOX = "48";
const PURCHASE_BASE_BOXES = ["20", "21", "22", "23", "24", "50"];

export type VatReport = {
  /** Exakta belopp per ruta, positiva som på blanketten. */
  exact: Record<string, number>;
  /** Hela kronor: ören faller bort i deklarationen. */
  boxes: Record<string, number>;
  /** Ruta 49: positivt = att betala, negativt = att få tillbaka. */
  box49: number;
  /** Exakt moms enligt bokföringen före avrundning. */
  exactPayable: number;
  /** Moms per konto i perioden (debet − kredit), det momsavslutet nollar. */
  vatAccountBalances: Map<number, number>;
  needsEcSalesList: boolean;
};

export function vatReport(
  lines: PostedLine[],
  accounts: Pick<Account, "number" | "vat_box">[],
  closingIds: Set<string>,
  from: string,
  to: string,
): VatReport {
  const boxOf = new Map(accounts.map((a) => [a.number, a.vat_box]));
  const net = new Map<string, number>();
  const vatAccounts = new Map<number, number>();
  for (const l of lines) {
    if (l.date < from || l.date > to || closingIds.has(l.entry_id)) continue;
    const box = l.vat_box ?? boxOf.get(l.account) ?? null;
    const signed = ore(l.debit) - ore(l.credit);
    if (box) net.set(box, (net.get(box) ?? 0) + signed);
    const accountBox = boxOf.get(l.account);
    if (accountBox && (OUTPUT_VAT_BOXES.includes(accountBox) || accountBox === INPUT_VAT_BOX)) {
      vatAccounts.set(l.account, (vatAccounts.get(l.account) ?? 0) + signed);
    }
  }
  const exact: Record<string, number> = {};
  const boxes: Record<string, number> = {};
  for (const [box, value] of net) {
    // Debetrutor: inköp och ingående moms. Övriga är kredit (försäljning, utgående moms).
    const debitBox = box === INPUT_VAT_BOX || PURCHASE_BASE_BOXES.includes(box);
    const amount = (debitBox ? value : -value) / 100 + 0;
    exact[box] = amount;
    boxes[box] = Math.trunc(amount) + 0;
  }
  const output = OUTPUT_VAT_BOXES.reduce((s, b) => s + (boxes[b] ?? 0), 0);
  const exactOutput = OUTPUT_VAT_BOXES.reduce((s, b) => s + ore(exact[b] ?? 0), 0);
  const box49 = output - (boxes[INPUT_VAT_BOX] ?? 0);
  return {
    exact,
    boxes,
    box49,
    exactPayable: (exactOutput - ore(exact[INPUT_VAT_BOX] ?? 0)) / 100,
    vatAccountBalances: new Map([...vatAccounts].filter(([, v]) => v !== 0).map(([a, v]) => [a, v / 100])),
    needsEcSalesList: ["35", "38", "39"].some((b) => (exact[b] ?? 0) !== 0),
  };
}

/** Momsavslut: nollar periodens momskonton mot 2650, med ören på 3740. */
export function vatClosingLines(report: VatReport): EntryLine[] {
  const lines: EntryLine[] = [];
  for (const [account, balance] of [...report.vatAccountBalances].sort(([a], [b]) => a - b)) {
    lines.push(
      balance > 0
        ? { account, debit: 0, credit: round2(balance) }
        : { account, debit: round2(-balance), credit: 0 },
    );
  }
  if (report.box49 > 0) lines.push({ account: ACC.VAT_SETTLEMENT, debit: 0, credit: report.box49 });
  if (report.box49 < 0) lines.push({ account: ACC.VAT_SETTLEMENT, debit: -report.box49, credit: 0 });
  const rest = round2(report.exactPayable - report.box49);
  if (rest > 0) lines.push({ account: ACC.ROUNDING, debit: 0, credit: rest });
  if (rest < 0) lines.push({ account: ACC.ROUNDING, debit: -rest, credit: 0 });
  return lines;
}

// ---------- Resultat- och balansräkning -------------------------------------

export type ReportRow = { account: number; name: string; amount: number };
export type ReportGroup = { label: string; rows: ReportRow[]; total: number };

const INCOME_STATEMENT_GROUPS: { label: string; from: number; to: number }[] = [
  { label: "Rörelsens intäkter", from: 3000, to: 3999 },
  { label: "Inköp", from: 4000, to: 4999 },
  { label: "Övriga externa kostnader", from: 5000, to: 6999 },
  { label: "Personalkostnader", from: 7000, to: 7699 },
  { label: "Avskrivningar", from: 7700, to: 7999 },
  { label: "Finansiella poster", from: 8000, to: 8799 },
  { label: "Bokslutsdispositioner", from: 8800, to: 8899 },
  { label: "Skatt", from: 8900, to: 8999 },
];

const nameFor = (accounts: Map<number, string>, n: number) => accounts.get(n) ?? `Konto ${n}`;

/** Resultaträkning: intäkter positiva, kostnader negativa. */
export function incomeStatement(balanceMap: Map<number, number>, accounts: Account[]) {
  const names = new Map(accounts.map((a) => [a.number, a.name]));
  const groups: ReportGroup[] = INCOME_STATEMENT_GROUPS.map((g) => {
    const rows = [...balanceMap]
      .filter(([a, v]) => a >= g.from && a <= g.to && v !== 0)
      .sort(([a], [b]) => a - b)
      .map(([account, v]) => ({ account, name: nameFor(names, account), amount: round2(-v) }));
    return { label: g.label, rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)) };
  });
  return { groups, result: round2(groups.reduce((s, g) => s + g.total, 0)) };
}

/**
 * Balansräkning per ett datum. `resultToDate` är resultatet som inte är omfört till
 * eget kapital (bokslut görs inte i portalen). Tillgångar = eget kapital + skulder.
 */
export function balanceSheet(balanceMap: Map<number, number>, accounts: Account[], resultToDate: number) {
  const names = new Map(accounts.map((a) => [a.number, a.name]));
  const pick = (from: number, to: number, sign: 1 | -1): ReportRow[] =>
    [...balanceMap]
      .filter(([a, v]) => a >= from && a <= to && v !== 0)
      .sort(([a], [b]) => a - b)
      .map(([account, v]) => ({ account, name: nameFor(names, account), amount: round2(sign * v) }));
  const sum = (rows: ReportRow[]) => round2(rows.reduce((s, r) => s + r.amount, 0));
  const assets = pick(1000, 1999, 1);
  const equityRows = pick(2000, 2099, -1);
  const liabilities = pick(2100, 2999, -1);
  const equity = round2(sum(equityRows) + resultToDate);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const shareCapital = round2(-(balanceMap.get(ACC.SHARE_CAPITAL) ?? 0));
  return {
    assets,
    equityRows,
    liabilities,
    totalAssets,
    totalLiabilities,
    equity,
    resultToDate,
    balanced: ore(totalAssets) === ore(equity + totalLiabilities),
    shareCapital,
    /** ABL 25 kap: eget kapital under hälften av aktiekapitalet. */
    capitalShortfall: shareCapital > 0 && equity < shareCapital / 2,
  };
}

/** Resultatet: intäkter minus kostnader ur ett saldo per konto. */
export function resultOf(balanceMap: Map<number, number>): number {
  let total = 0;
  for (const [account, v] of balanceMap) {
    if (!isBalanceAccount(account)) total += ore(-v);
  }
  return total / 100;
}

// ---------- Nyckeltal -------------------------------------------------------

export type LedgerStats = {
  inflow: number;
  outflow: number;
  outputVat: number;
  inputVat: number;
  receivables: number;
  payables: number;
  vatDue: number;
  ownerDebt: number;
};

const inRange = (n: number, from: number, to: number) => n >= from && n <= to;

export function ledgerStats(
  allLines: PostedLine[],
  closingIds: Set<string>,
  reversalIds: Set<string>,
  from: string,
  to: string,
): LedgerStats {
  const s = { inflow: 0, outflow: 0, outputVat: 0, inputVat: 0, receivables: 0, payables: 0, vatDue: 0, ownerDebt: 0 };
  for (const l of allLines) {
    const debit = ore(l.debit);
    const credit = ore(l.credit);
    const period = l.date >= from && l.date <= to;
    // In- och utbetalningar är bruttosummor, så rättade poster räknas inte alls.
    if (period && inRange(l.account, 1900, 1999) && !reversalIds.has(l.entry_id)) {
      s.inflow += debit;
      s.outflow += credit;
    }
    if (period && !closingIds.has(l.entry_id)) {
      if (inRange(l.account, 2610, 2639)) s.outputVat += credit - debit;
      if (inRange(l.account, 2640, 2649)) s.inputVat += debit - credit;
    }
    // Saldon är till och med i dag, oavsett år.
    if (inRange(l.account, 1510, 1519)) s.receivables += debit - credit;
    if (inRange(l.account, 2440, 2449)) s.payables += credit - debit;
    if (inRange(l.account, 2610, 2650)) s.vatDue += credit - debit;
    if (l.account === ACC.OWNER_DEBT) s.ownerDebt += credit - debit;
  }
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / 100])) as LedgerStats;
}

// ---------- Åldersanalys ----------------------------------------------------

export const AGE_BUCKETS = ["Ej förfallet", "1–30 dagar", "31–60 dagar", "61–90 dagar", "Över 90 dagar"];

export function ageBucket(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000;
  if (days <= 30) return 1;
  if (days <= 60) return 2;
  if (days <= 90) return 3;
  return 4;
}

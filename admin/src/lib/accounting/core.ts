// Bokföring: konton, moms och konteringsrader. Ren fil utan server-beroenden, så
// att kön i webbläsaren och API:t bygger raderna på exakt samma sätt.
//
// Tecken: debet och kredit är alltid positiva, och en rad har belopp på en sida.
// Köp och försäljning bygger raderna från bruttobeloppet (det som betalas). Ett
// negativt brutto betyder återbetalning/kredit och vänder raderna.

export const ACC = {
  RECEIVABLES: 1510,
  TAX_ACCOUNT: 1630,
  BANK: 1930,
  SHARE_CAPITAL: 2081,
  PAYABLES: 2440,
  VAT_OUT_25: 2611,
  VAT_OUT_RC_25: 2614,
  VAT_OUT_12: 2621,
  VAT_OUT_6: 2631,
  VAT_IN: 2641,
  VAT_IN_RC: 2645,
  VAT_SETTLEMENT: 2650,
  OWNER_DEBT: 2893,
  SUSPENSE: 2999,
  SALES_25: 3001,
  SALES_12: 3002,
  SALES_6: 3003,
  SALES_NO_VAT: 3004,
  ROUNDING: 3740,
  OTHER_COSTS: 6991,
} as const;

export type VatCode = "se25" | "se12" | "se6" | "none" | "eu_rc" | "noneu_rc";

export const VAT_OPTIONS: { code: VatCode; label: string }[] = [
  { code: "se25", label: "25 % moms" },
  { code: "se12", label: "12 % moms" },
  { code: "se6", label: "6 % moms" },
  { code: "none", label: "Ingen moms" },
  { code: "eu_rc", label: "Omvänd moms, tjänst från EU (ruta 21)" },
  { code: "noneu_rc", label: "Omvänd moms, tjänst utanför EU (ruta 22)" },
];

export const isVatCode = (s: unknown): s is VatCode => VAT_OPTIONS.some((v) => v.code === s);

const RATE: Partial<Record<VatCode, number>> = { se25: 0.25, se12: 0.12, se6: 0.06 };
const RC_RATE = 0.25;
const RC_BOX: Partial<Record<VatCode, string>> = { eu_rc: "21", noneu_rc: "22" };

export type LineRole = "primary" | "contra" | "vat" | "rounding";

export type EntryLine = {
  account: number;
  debit: number;
  credit: number;
  /** Ruta i momsdeklarationen när den inte följer av kontot (omvänd moms). */
  vat_box?: string | null;
  note?: string | null;
  /** Bara i kön: "primary" är kontovalet, "contra" pengarnas väg. Sparas inte. */
  role?: LineRole;
};

// "+ 0" gör -0 till 0, annars visas beloppet som "-0,00".
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 + 0;
export const ore = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100) + 0;

const debit = (account: number, amount: number, role?: LineRole, vat_box?: string): EntryLine => ({
  account,
  debit: round2(amount),
  credit: 0,
  ...(role ? { role } : {}),
  ...(vat_box ? { vat_box } : {}),
});
const credit = (account: number, amount: number, role?: LineRole): EntryLine => ({
  account,
  debit: 0,
  credit: round2(amount),
  ...(role ? { role } : {}),
});

export const flipLines = (lines: EntryLine[]): EntryLine[] =>
  lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));

/** Summa debet minus summa kredit, i kronor. Noll när verifikationen balanserar. */
export function imbalance(lines: Pick<EntryLine, "debit" | "credit">[]): number {
  return lines.reduce((s, l) => s + ore(l.debit) - ore(l.credit), 0) / 100;
}

/**
 * Köp: kostnad (och moms) i debet, motkontot (bank, leverantörsskuld, skuld till
 * ägare) i kredit. Vid omvänd skattskyldighet betalas hela beloppet till
 * leverantören, och momsen räknas fram i både utgående och ingående moms.
 */
export function purchaseLines(opts: {
  gross: number;
  account: number;
  vat: VatCode;
  contra: number;
}): EntryLine[] {
  const { account, vat, contra } = opts;
  const gross = round2(Math.abs(opts.gross));
  const rate = RATE[vat];
  let lines: EntryLine[];
  if (rate) {
    const net = round2(gross / (1 + rate));
    lines = [
      debit(account, net, "primary"),
      debit(ACC.VAT_IN, round2(gross - net), "vat"),
      credit(contra, gross, "contra"),
    ];
  } else if (vat === "eu_rc" || vat === "noneu_rc") {
    const tax = round2(gross * RC_RATE);
    lines = [
      debit(account, gross, "primary", RC_BOX[vat]),
      credit(contra, gross, "contra"),
      debit(ACC.VAT_IN_RC, tax, "vat"),
      credit(ACC.VAT_OUT_RC_25, tax, "vat"),
    ];
  } else {
    lines = [debit(account, gross, "primary"), credit(contra, gross, "contra")];
  }
  return opts.gross < 0 ? flipLines(lines) : lines;
}

/** Försäljningskonto och utgående momskonto för en momssats i procent. */
export function salesAccounts(ratePct: number): { sales: number; vat: number | null } {
  if (ratePct === 25) return { sales: ACC.SALES_25, vat: ACC.VAT_OUT_25 };
  if (ratePct === 12) return { sales: ACC.SALES_12, vat: ACC.VAT_OUT_12 };
  if (ratePct === 6) return { sales: ACC.SALES_6, vat: ACC.VAT_OUT_6 };
  return { sales: ACC.SALES_NO_VAT, vat: null };
}

/**
 * Försäljning: motkontot (kundfordran eller bank) i debet, intäkt och moms i
 * kredit. Skillnaden mot brutto är öresavrundning. Kreditfakturor är negativa.
 */
export function saleLines(opts: {
  gross: number;
  net: number;
  vat: number;
  ratePct: number;
  account: number;
  contra: number;
}): EntryLine[] {
  const gross = round2(Math.abs(opts.gross));
  const net = round2(Math.abs(opts.net));
  const tax = round2(Math.abs(opts.vat));
  const { vat: vatAccount } = salesAccounts(opts.ratePct);
  const lines: EntryLine[] = [debit(opts.contra, gross, "contra"), credit(opts.account, net, "primary")];
  if (tax > 0) lines.push(credit(vatAccount ?? ACC.VAT_OUT_25, tax, "vat"));
  const rounding = round2(gross - net - tax);
  if (rounding > 0) lines.push(credit(ACC.ROUNDING, rounding, "rounding"));
  if (rounding < 0) lines.push(debit(ACC.ROUNDING, -rounding, "rounding"));
  return opts.gross < 0 ? flipLines(lines) : lines;
}

/** Försäljning där bara bruttot är känt, t.ex. en inbetalning utan faktura. */
export function saleFromGross(opts: { gross: number; vat: VatCode; account: number; contra: number }): EntryLine[] {
  const rate = RATE[opts.vat] ?? 0;
  const gross = round2(Math.abs(opts.gross));
  const net = round2(gross / (1 + rate));
  const lines = saleLines({
    gross,
    net,
    vat: round2(gross - net),
    ratePct: rate * 100,
    account: opts.account,
    contra: opts.contra,
  });
  return opts.gross < 0 ? flipLines(lines) : lines;
}

/** En enkel omföring mellan två konton. */
export function transferLines(debitAccount: number, creditAccount: number, amount: number): EntryLine[] {
  return [debit(debitAccount, Math.abs(amount), "primary"), credit(creditAccount, Math.abs(amount), "contra")];
}

/** Så byggs raderna i ett förslag om när någon byter moms i kön. */
export type LineMode = "purchase" | "sale" | "fixed";

export function rebuildLines(
  mode: LineMode,
  opts: { gross: number; account: number; contra: number; vat: VatCode },
): EntryLine[] | null {
  if (mode === "purchase") return purchaseLines(opts);
  if (mode === "sale") return saleFromGross(opts);
  return null;
}

/** Kontoklass för gruppering i kontolistan och rapporterna. */
export const ACCOUNT_CLASSES: { digit: number; label: string }[] = [
  { digit: 1, label: "1 Tillgångar" },
  { digit: 2, label: "2 Eget kapital och skulder" },
  { digit: 3, label: "3 Intäkter" },
  { digit: 4, label: "4 Inköp" },
  { digit: 5, label: "5 Övriga externa kostnader" },
  { digit: 6, label: "6 Övriga externa kostnader" },
  { digit: 7, label: "7 Personal och avskrivningar" },
  { digit: 8, label: "8 Finansiella poster och skatt" },
];

export const isBalanceAccount = (account: number) => account < 3000;

export type Account = {
  number: number;
  name: string;
  vat_box: string | null;
  common: boolean;
  active: boolean;
  custom?: boolean;
};

export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(round2(Number(n) || 0))
    .replace(/−/g, "-");

export const moneySek = (n: number | string | null | undefined) => `${money(n)} kr`;

/** Rensar rader från klienten till det som bokförs. Kastar vid ogiltiga värden. */
export function sanitizeLines(raw: unknown): EntryLine[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 50) {
    throw new Error("En verifikation måste ha minst två rader.");
  }
  return raw.map((l: any, i) => {
    const account = Number(l?.account);
    const d = round2(Number(l?.debit) || 0);
    const c = round2(Number(l?.credit) || 0);
    if (!Number.isInteger(account) || account < 1000 || account > 8999) {
      throw new Error(`Rad ${i + 1}: ogiltigt konto.`);
    }
    if (d < 0 || c < 0 || (d === 0) === (c === 0)) {
      throw new Error(`Rad ${i + 1}: ange belopp i antingen debet eller kredit.`);
    }
    const box = typeof l?.vat_box === "string" && /^\d{2}$/.test(l.vat_box) ? l.vat_box : null;
    const note = typeof l?.note === "string" ? l.note.slice(0, 200) : null;
    return { account, debit: d, credit: c, vat_box: box, note };
  });
}

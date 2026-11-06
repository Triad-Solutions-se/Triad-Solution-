// SIE typ 4 (.se): export av räkenskapsåret till redovisningskonsult och
// bokslutsprogram. Följer SIE filformat utgåva 4C (2025-08-06):
//   - Teckenuppsättning IBM PC 8-bitars (codepage 437), #FORMAT PC8.
//   - Ordning: flaggpost, identifikation, kontoplan, saldon och verifikationer.
//   - Kreditsaldon och kreditbelopp är negativa, punkt som decimaltecken.
//   - Fält med mellanslag omges av citationstecken, citationstecken inuti fält
//     föregås av backslash, och kontrolltecken får inte förekomma.
//   - Saldon som är noll behöver inte skrivas.
//   - #KSUMMA är frivillig och skrivs inte. BAS 2026 anges som #KPTYP EUBAS97.

import { type Account, isBalanceAccount, ore } from "./core";
import type { LedgerEntry, LedgerLine } from "./reports";
import type { FiscalYear } from "./periods";

// Tecken 0x80–0xFF i codepage 437.
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const CP437_MAP = new Map([...CP437_HIGH].map((ch, i) => [ch, 0x80 + i]));
// Vanliga tecken som saknas i teckenuppsättningen.
const REPLACEMENTS: Record<string, string> = { "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "€": "EUR" };

export function encodeCp437(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const raw of text) {
    for (const ch of REPLACEMENTS[raw] ?? raw) {
      const code = ch.charCodeAt(0);
      if (code < 0x80) bytes.push(code);
      else bytes.push(CP437_MAP.get(ch) ?? 0x3f); // "?"
    }
  }
  return Uint8Array.from(bytes);
}

/** Fält: kontrolltecken bort, citationstecken skyddas, alltid inom citationstecken. */
export function sieString(value: string | null | undefined): string {
  const clean = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\\/g, "/")
    .replace(/"/g, '\\"')
    .trim();
  return `"${clean}"`;
}

const sieDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const sieAmount = (oreValue: number) => (oreValue / 100).toFixed(2);

/** Organisationsnummer med bindestreck efter sjätte siffran, annars inget. */
export function sieOrgNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export type SieInput = {
  companyName: string;
  orgNumber: string | null;
  fiscalYear: FiscalYear;
  previousFiscalYear: FiscalYear | null;
  accounts: Account[];
  /** Alla verifikationer, även från tidigare år (för ingående balanser). */
  entries: LedgerEntry[];
  lines: LedgerLine[];
  generatedAt: string;
  generatedBy: string | null;
};

export function buildSie(input: SieInput): string {
  const { fiscalYear: fy, previousFiscalYear: prev } = input;
  const entryById = new Map(input.entries.map((e) => [e.id, e]));
  const usedAccounts = new Set(input.lines.map((l) => l.account));

  // Saldon i ören per konto: före året och under året.
  const opening = new Map<number, number>();
  const period = new Map<number, number>();
  const previousPeriod = new Map<number, number>();
  const previousOpening = new Map<number, number>();
  for (const l of input.lines) {
    const e = entryById.get(l.entry_id);
    if (!e) continue;
    const value = ore(l.debit) - ore(l.credit);
    if (e.date < fy.start_date) {
      opening.set(l.account, (opening.get(l.account) ?? 0) + value);
      if (prev && e.date >= prev.start_date) previousPeriod.set(l.account, (previousPeriod.get(l.account) ?? 0) + value);
      if (prev && e.date < prev.start_date) previousOpening.set(l.account, (previousOpening.get(l.account) ?? 0) + value);
    } else if (e.date <= fy.end_date) {
      period.set(l.account, (period.get(l.account) ?? 0) + value);
    }
  }

  // Resultat från tidigare år är inte omfört (inget bokslut i portalen): det läggs
  // på 2098 i ingående balans, så att balansräkningen går ihop i mottagande program.
  const carry = (from: Map<number, number>) => {
    const out = new Map<number, number>();
    let result = 0;
    for (const [account, value] of from) {
      if (isBalanceAccount(account)) out.set(account, value);
      else result += value;
    }
    if (result !== 0) {
      out.set(2098, (out.get(2098) ?? 0) + result);
      usedAccounts.add(2098);
    }
    return out;
  };
  const ib = carry(opening);
  const prevIb = carry(previousOpening);

  const out: string[] = [
    "#FLAGGA 0",
    `#PROGRAM ${sieString("MCA Portal")} 1.0`,
    "#FORMAT PC8",
    `#GEN ${sieDate(input.generatedAt)}${input.generatedBy ? ` ${sieString(input.generatedBy)}` : ""}`,
    "#SIETYP 4",
  ];
  const org = sieOrgNumber(input.orgNumber);
  if (org) out.push(`#ORGNR ${org}`);
  out.push(`#FNAMN ${sieString(input.companyName)}`);
  out.push(`#RAR 0 ${sieDate(fy.start_date)} ${sieDate(fy.end_date)}`);
  if (prev) out.push(`#RAR -1 ${sieDate(prev.start_date)} ${sieDate(prev.end_date)}`);
  out.push("#KPTYP EUBAS97");
  out.push("#VALUTA SEK");

  for (const a of [...input.accounts].sort((x, y) => x.number - y.number)) {
    if (a.active || usedAccounts.has(a.number)) out.push(`#KONTO ${a.number} ${sieString(a.name)}`);
  }

  const writeBalances = (label: string, year: number, map: Map<number, number>) => {
    for (const [account, value] of [...map].sort(([a], [b]) => a - b)) {
      if (value !== 0) out.push(`${label} ${year} ${account} ${sieAmount(value)}`);
    }
  };
  const addMaps = (a: Map<number, number>, b: Map<number, number>) => {
    const sum = new Map(a);
    for (const [k, v] of b) sum.set(k, (sum.get(k) ?? 0) + v);
    return sum;
  };
  const balanceOnly = (map: Map<number, number>) => new Map([...map].filter(([a]) => isBalanceAccount(a)));
  const resultOnly = (map: Map<number, number>) => new Map([...map].filter(([a]) => !isBalanceAccount(a)));

  writeBalances("#IB", 0, ib);
  writeBalances("#UB", 0, addMaps(ib, balanceOnly(period)));
  writeBalances("#RES", 0, resultOnly(period));
  if (prev) {
    writeBalances("#IB", -1, prevIb);
    writeBalances("#UB", -1, addMaps(prevIb, balanceOnly(previousPeriod)));
    writeBalances("#RES", -1, resultOnly(previousPeriod));
  }

  const yearEntries = input.entries
    .filter((e) => e.date >= fy.start_date && e.date <= fy.end_date)
    .sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
  const linesByEntry = new Map<string, LedgerLine[]>();
  for (const l of input.lines) {
    const list = linesByEntry.get(l.entry_id);
    if (list) list.push(l);
    else linesByEntry.set(l.entry_id, [l]);
  }
  for (const e of yearEntries) {
    out.push(`#VER ${sieString(e.series)} ${e.number} ${sieDate(e.date)} ${sieString(e.description)} ${sieDate(e.created_at)}`);
    out.push("{");
    for (const l of (linesByEntry.get(e.id) ?? []).sort((a, b) => a.line_no - b.line_no)) {
      const amount = sieAmount(ore(l.debit) - ore(l.credit));
      // Rutan för omvänd moms syns inte i kontot, så den följer med som radtext.
      const text = l.vat_box ? ` "" ${sieString(`Moms ruta ${l.vat_box}`)}` : "";
      out.push(`#TRANS ${l.account} {} ${amount}${text}`);
    }
    out.push("}");
  }
  return `${out.join("\r\n")}\r\n`;
}

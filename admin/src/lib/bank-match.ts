// Bankavstämning: hittar vilka obetalda kundfakturor en inbetalning från
// banken (bank_transactions) kan gälla. Ren fil utan server-beroenden — samma
// regler används av synken (automatisk koppling), API:t och Ekonomi-sidan.
//
// Regler (alla kräver bokförd inbetalning, obetald faktura och exakt samma
// belopp och valuta):
//   Stark — fakturans OCR-nummer eller fakturanummer står i bankens referens
//     eller meddelandetext. Kopplas automatiskt vid synk om paret är entydigt:
//     inbetalningen pekar bara ut en faktura och fakturan bara en inbetalning,
//     och ingen har ångrat eller avfärdat något förslag för inbetalningen.
//   Svag — motpartens namn liknar kundens namn. Visas bara som förslag och
//     kopplas aldrig automatiskt.
// Par som någon ångrat eller avfärdat (status 'rejected', migration 0040)
// föreslås inte igen.

import { isOutstanding } from "./invoice";

export type MatchRule = "ocr" | "number" | "name";
export type MatchStrength = "strong" | "weak";

export type MatchTransaction = {
  id: string;
  status: string;
  booking_date: string | null;
  amount: number | string;
  currency: string | null;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
};

export type MatchInvoice = {
  id: string;
  number: string;
  ocr: string | null;
  status: string | null;
  credited_invoice_id: string | null;
  customer_name: string | null;
  amount_sek: number | string | null;
  currency: string | null;
  issued_at: string | null;
  due_date: string | null;
};

export type BankInvoiceMatch = {
  id: string;
  bank_transaction_id: string;
  invoice_id: string;
  status: "applied" | "rejected";
  method: "auto" | "manual";
  rule: MatchRule | "manual";
  created_at: string;
};

export type MatchSuggestion = {
  transactionId: string;
  invoiceId: string;
  strength: MatchStrength;
  rule: MatchRule;
  /** Kort förklaring på svenska, t.ex. "OCR 202600191 i referensen". */
  reason: string;
};

/** Hur många svaga förslag som visas per inbetalning. */
const MAX_WEAK_PER_TRANSACTION = 3;
/** En svag träff måste vara bokförd högst så här många dagar före fakturadatumet. */
const WEAK_EARLIEST_DAYS_BEFORE_ISSUE = 7;

const ore = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100);

/** En inbetalning som kan betala en faktura: bokförd och positiv. */
export function isMatchableTransaction(tx: Pick<MatchTransaction, "status" | "amount">): boolean {
  return tx.status === "BOOK" && ore(tx.amount) > 0;
}

export function sameAmount(tx: MatchTransaction, inv: MatchInvoice): boolean {
  return (
    ore(tx.amount) === ore(inv.amount_sek) && (tx.currency || "SEK") === (inv.currency || "SEK")
  );
}

// ---------- Referenser ----------

/**
 * Var i bankens text fakturan nämns, om den gör det. OCR-numret jämförs mot
 * hela sifferföljder (inledande nollor tillåts — vissa banker fyller ut
 * referensen). Fakturanumret YYYY-NNN får skrivas med eller utan
 * avskiljare ("2026-001", "2026001", "2026 001", "2026/001", "2026-1").
 */
export function referenceHit(
  tx: Pick<MatchTransaction, "reference" | "description">,
  inv: Pick<MatchInvoice, "number" | "ocr">,
): { rule: "ocr" | "number"; reason: string } | null {
  const fields: [string, string | null][] = [
    ["referensen", tx.reference],
    ["meddelandet", tx.description],
  ];
  if (inv.ocr) {
    for (const [where, text] of fields) {
      const runs = (text ?? "").match(/\d+/g) ?? [];
      if (runs.some((r) => r.replace(/^0+/, "") === inv.ocr)) {
        return { rule: "ocr", reason: `OCR ${inv.ocr} i ${where}` };
      }
    }
  }
  const pattern = invoiceNumberPattern(inv.number);
  if (pattern) {
    for (const [where, text] of fields) {
      if (text && pattern.test(text)) {
        return { rule: "number", reason: `Fakturanummer ${inv.number} i ${where}` };
      }
    }
  }
  return null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function invoiceNumberPattern(number: string | null | undefined): RegExp | null {
  const n = (number ?? "").trim();
  const m = /^(\d{4})-(\d+)$/.exec(n);
  if (m) {
    const [, year, seq] = m;
    const bare = seq.replace(/^0+/, "") || "0";
    // 2026-001 / 2026001 / 2026 001 / 2026/001, eller 2026-1 / 2026-01 med avskiljare.
    return new RegExp(`(?<!\\d)${year}(?:[\\s\\-/._]*${seq}|[\\-/]0*${bare})(?!\\d)`);
  }
  // Äldre fakturor med fritt nummer: hela numret, avgränsat, och minst en siffra.
  if (n.length >= 3 && /\d/.test(n)) {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, "iu");
  }
  return null;
}

// ---------- Namn ----------

// Bolagsformer och småord som inte säger något om vem som betalat.
const NAME_NOISE = new Set([
  "ab", "aktiebolag", "publ", "hb", "handelsbolag", "kb", "kommanditbolag", "ef", "enskild",
  "firma", "ek", "for", "ekonomisk", "forening", "ideell", "i", "och", "the", "of", "and",
  "ltd", "limited", "inc", "llc", "gmbh", "as", "asa", "aps", "oy", "oyj", "bv", "sverige",
  "sweden", "svenska", "scandinavia", "nordic", "group", "holding",
]);

export function nameTokens(name: string | null | undefined): string[] {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’´`]/g, "")
    .replace(/&/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !NAME_NOISE.has(t));
}

// Bankerna kortar ofta motpartens namn ("PIZZERIA NAPOLI I JONKOPI"), så ett
// ord räknas som träff om det ena är början på det andra (minst 3 tecken).
const tokenMatch = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/**
 * Liknar motpartens namn kundens? Alla meningsbärande ord i det kortare namnet
 * måste finnas i det längre — "Napoli" ≈ "Pizzeria Napoli i Jönköping AB", men
 * "Restaurang Roma" ≉ "Restaurang Napoli".
 */
export function namesResemble(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.join("").length < 3) return false;
  return short.every((s) => long.some((l) => tokenMatch(s, l)));
}

// ---------- Förslag ----------

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** Starkt eller svagt förslag för ett par, eller null. Belopp och status kontrolleras här. */
export function classifyPair(
  tx: MatchTransaction,
  inv: MatchInvoice,
): Omit<MatchSuggestion, "transactionId" | "invoiceId"> | null {
  if (!isMatchableTransaction(tx) || !isOutstanding(inv) || !sameAmount(tx, inv)) return null;
  const hit = referenceHit(tx, inv);
  if (hit) return { strength: "strong", ...hit };
  if (
    tx.booking_date &&
    inv.issued_at &&
    daysBetween(tx.booking_date, inv.issued_at) > WEAK_EARLIEST_DAYS_BEFORE_ISSUE
  ) {
    return null;
  }
  if (namesResemble(tx.counterparty, inv.customer_name)) {
    return { strength: "weak", rule: "name", reason: `Samma belopp, avsändaren liknar ${inv.customer_name}` };
  }
  return null;
}

export type MatchPlan = {
  /** Förslag per transaktion, starka först, sedan äldsta fakturan först. */
  suggestions: Map<string, MatchSuggestion[]>;
  /** Starka par som är entydiga åt båda hållen — synken kopplar dem. */
  autoApply: MatchSuggestion[];
};

/**
 * Räknar fram förslag för alla inbetalningar som inte redan är kopplade, mot
 * alla obetalda fakturor som inte redan är kopplade. Avvisade par hoppas över.
 */
export function planMatches(
  transactions: MatchTransaction[],
  invoices: MatchInvoice[],
  matches: Pick<BankInvoiceMatch, "bank_transaction_id" | "invoice_id" | "status">[],
): MatchPlan {
  const takenTx = new Set<string>();
  const takenInv = new Set<string>();
  const rejected = new Set<string>();
  const touchedTx = new Set<string>();
  for (const m of matches) {
    if (m.status === "applied") {
      takenTx.add(m.bank_transaction_id);
      takenInv.add(m.invoice_id);
    } else {
      rejected.add(`${m.bank_transaction_id}:${m.invoice_id}`);
      touchedTx.add(m.bank_transaction_id);
    }
  }

  const openInvoices = invoices.filter((inv) => !takenInv.has(inv.id) && isOutstanding(inv));
  const byAmount = new Map<string, MatchInvoice[]>();
  for (const inv of openInvoices) {
    const key = `${ore(inv.amount_sek)}:${inv.currency || "SEK"}`;
    byAmount.set(key, [...(byAmount.get(key) ?? []), inv]);
  }
  const invoiceOrder = (inv: MatchInvoice) => inv.due_date ?? inv.issued_at ?? "";

  const suggestions = new Map<string, MatchSuggestion[]>();
  const strongByInvoice = new Map<string, number>();
  for (const tx of transactions) {
    if (takenTx.has(tx.id) || !isMatchableTransaction(tx)) continue;
    const candidates = byAmount.get(`${ore(tx.amount)}:${tx.currency || "SEK"}`) ?? [];
    const found: (MatchSuggestion & { order: string })[] = [];
    for (const inv of candidates) {
      if (rejected.has(`${tx.id}:${inv.id}`)) continue;
      const c = classifyPair(tx, inv);
      if (c) found.push({ transactionId: tx.id, invoiceId: inv.id, ...c, order: invoiceOrder(inv) });
    }
    if (!found.length) continue;
    found.sort(
      (a, b) =>
        (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1) || a.order.localeCompare(b.order),
    );
    // Pekar texten ut en faktura visas inte gissningar på namn bredvid.
    const strong = found.filter((s) => s.strength === "strong");
    const shown = strong.length ? strong : found.slice(0, MAX_WEAK_PER_TRANSACTION);
    for (const s of strong) strongByInvoice.set(s.invoiceId, (strongByInvoice.get(s.invoiceId) ?? 0) + 1);
    suggestions.set(
      tx.id,
      shown.map(({ order: _order, ...s }) => s),
    );
  }

  // En inbetalning där någon redan ångrat eller avfärdat ett förslag lämnas åt
  // människan, även om bara en stark träff återstår.
  const autoApply: MatchSuggestion[] = [];
  for (const [txId, list] of suggestions) {
    if (touchedTx.has(txId)) continue;
    const strong = list.filter((s) => s.strength === "strong");
    if (strong.length === 1 && strongByInvoice.get(strong[0].invoiceId) === 1) autoApply.push(strong[0]);
  }
  return { suggestions, autoApply };
}

export const MATCH_RULE_LABEL: Record<MatchRule | "manual", string> = {
  ocr: "OCR-nummer",
  number: "Fakturanummer",
  name: "Belopp och namn",
  manual: "Manuell",
};

// ---------- Visning ----------

export type InvoiceRef = { invoiceId: string; number: string; customer: string | null };

export type TxMatchInfo = {
  /** Fakturan inbetalningen betalade. */
  applied: (InvoiceRef & { matchId: string; method: "auto" | "manual"; rule: MatchRule | "manual" }) | null;
  suggestions: (InvoiceRef & { strength: MatchStrength; reason: string; dueDate: string | null })[];
  /** Övriga obetalda fakturor på samma belopp, för manuell koppling. */
  options: InvoiceRef[];
};

/** Det Ekonomi-sidan visar per inbetalning: kopplad faktura, förslag och val. */
export function describeMatches(
  transactions: MatchTransaction[],
  invoices: MatchInvoice[],
  matches: BankInvoiceMatch[],
): Record<string, TxMatchInfo> {
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const ref = (inv: MatchInvoice): InvoiceRef => ({
    invoiceId: inv.id,
    number: inv.number,
    customer: inv.customer_name,
  });
  const { suggestions } = planMatches(transactions, invoices, matches);
  const takenInv = new Set(matches.filter((m) => m.status === "applied").map((m) => m.invoice_id));
  const open = invoices.filter((inv) => !takenInv.has(inv.id) && isOutstanding(inv));

  const out: Record<string, TxMatchInfo> = {};
  for (const tx of transactions) {
    if (!isMatchableTransaction(tx)) continue;
    const m = matches.find((x) => x.bank_transaction_id === tx.id && x.status === "applied");
    const inv = m ? byId.get(m.invoice_id) : undefined;
    if (m && inv) {
      out[tx.id] = {
        applied: { ...ref(inv), matchId: m.id, method: m.method, rule: m.rule },
        suggestions: [],
        options: [],
      };
      continue;
    }
    const list = suggestions.get(tx.id) ?? [];
    const suggested = new Set(list.map((s) => s.invoiceId));
    out[tx.id] = {
      applied: null,
      suggestions: list.flatMap((s) => {
        const i = byId.get(s.invoiceId);
        return i ? [{ ...ref(i), strength: s.strength, reason: s.reason, dueDate: i.due_date }] : [];
      }),
      options: open.filter((i) => !suggested.has(i.id) && sameAmount(tx, i)).map(ref),
    };
  }
  return out;
}

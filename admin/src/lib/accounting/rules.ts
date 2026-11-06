// Konteringsregler: text från banken eller underlaget → konto och moms. Inlärda
// regler (någon valde ett annat konto och godkände) går före startförslagen, och
// en längre träff går före en kortare.

import type { VatCode } from "./core";

export type RuleDirection = "in" | "out" | "any";

export type AccountingRule = {
  id: string;
  pattern: string;
  direction: RuleDirection;
  account: number;
  vat_code: VatCode;
  origin: "seed" | "learned";
};

/** Gemener, bara bokstäver och siffror, ett mellanslag mellan orden. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9åäöéü]+/g, " ")
    .trim();
}

/**
 * Mönstret som lärs in för en motpart. Ord med siffror tas bort, eftersom
 * bankerna lägger till butiksnummer och ordernummer ("GODADDY*#4197102284").
 */
export function learnPattern(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const words = normalizeText(c)
      .split(" ")
      .filter((w) => w && !/\d/.test(w));
    if (words.length) return words.join(" ");
  }
  return null;
}

const contains = (text: string, pattern: string) => ` ${text} `.includes(` ${pattern} `);

/**
 * Bästa regeln för en text. `direction` är pengarnas riktning. En inbetalning från
 * en leverantör (regel för utbetalningar) räknas som återbetalning och märks med
 * `refund`; en utbetalning matchar aldrig en regel för inbetalningar.
 */
export function matchRule(
  text: string,
  direction: "in" | "out",
  rules: AccountingRule[],
): { rule: AccountingRule; refund: boolean } | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const rank = (r: AccountingRule) => (r.origin === "learned" ? 1000 : 0) + r.pattern.length;
  const hits = rules
    .filter((r) => contains(normalized, normalizeText(r.pattern)))
    .sort((a, b) => rank(b) - rank(a));
  const sameWay = hits.find((r) => r.direction === "any" || r.direction === direction);
  if (sameWay) return { rule: sameWay, refund: false };
  if (direction === "in") {
    const supplier = hits.find((r) => r.direction === "out");
    if (supplier) return { rule: supplier, refund: true };
  }
  return null;
}

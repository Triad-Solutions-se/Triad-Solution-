// Line items för offert-priser. Varje item bär sin egen rabatt (rabatten
// ligger inte längre på sektionsnivå). Sektionstotalerna räknas alltid ut
// från items.

export type OfferItem = {
  id: string;
  description: string;
  unit_price: number;
  discount_pct: number;
};

export type SectionTotals = {
  subtotal: number;        // SUM(unit_price)
  discount: number;        // SUM(unit_price * disc/100)
  afterDiscount: number;   // subtotal - discount
  vat: number;             // afterDiscount * vat/100
  total: number;           // afterDiscount + vat
};

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function num(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Normalisera ett item från DB/JSON — fyller defaults så övrig kod slipper
// null-checka varje fält.
export function normalizeItem(raw: any, fallbackId?: string): OfferItem {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : fallbackId ?? cryptoRandomId(),
    description: typeof raw?.description === "string" ? raw.description : "",
    unit_price: num(raw?.unit_price),
    discount_pct: clampPct(num(raw?.discount_pct)),
  };
}

export function normalizeItems(raw: unknown): OfferItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => normalizeItem(r, `item-${i}`));
}

// Faller tillbaka till ett single-item byggt av legacy-priset om items
// är tomma. Används av renderers så att äldre offerter (innan items-
// migrationen körts om) fortsätter att visas korrekt.
export function itemsOrFallback(
  items: OfferItem[],
  legacyPrice: number,
  legacyDiscPct: number,
  fallbackDescription: string,
): OfferItem[] {
  if (items.length > 0) return items;
  if (!legacyPrice || legacyPrice <= 0) return [];
  return [
    {
      id: "legacy",
      description: fallbackDescription,
      unit_price: legacyPrice,
      discount_pct: clampPct(legacyDiscPct),
    },
  ];
}

export function lineTotalAfterDiscount(item: OfferItem): number {
  return item.unit_price * (1 - clampPct(item.discount_pct) / 100);
}

export function lineDiscount(item: OfferItem): number {
  return item.unit_price * (clampPct(item.discount_pct) / 100);
}

export function computeSectionTotals(items: OfferItem[], vatRate: number): SectionTotals {
  const subtotal = items.reduce((s, it) => s + num(it.unit_price), 0);
  const discount = items.reduce((s, it) => s + lineDiscount(it), 0);
  const afterDiscount = subtotal - discount;
  const vat = afterDiscount * (num(vatRate) / 100);
  const total = afterDiscount + vat;
  return { subtotal, discount, afterDiscount, vat, total };
}

function cryptoRandomId(): string {
  // Browser + Node 19+: crypto.randomUUID. I äldre runtimes faller vi tillbaka
  // på Math.random — id:t används bara som React key / lokal referens, inte
  // som DB-PK.
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `item-${Math.random().toString(36).slice(2, 10)}`;
}

export function newEmptyItem(): OfferItem {
  return {
    id: cryptoRandomId(),
    description: "",
    unit_price: 0,
    discount_pct: 0,
  };
}

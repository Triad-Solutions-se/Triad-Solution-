// Kundfakturor — delad logik för editor, listor och PDF: rader, totaler med
// öresavrundning, status, datum, OCR/bankgiro och import av rader från
// offerter. Ren fil (inga server-beroenden) så den kan importeras överallt.
//
// Fakturanummer och OCR-nummer tilldelas av databasen (se
// supabase/migrations/0034_invoice_system.sql). invoiceOcr() nedan är samma
// algoritm som public.invoice_ocr och används för förhandsvisning/kontroll.

import { type OfferItem, clampPct, itemsOrFallback, normalizeItems } from "./offer-items";

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number; // exkl. moms
  discount_pct: number;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "credited";

type Tone = "gray" | "blue" | "green" | "red" | "orange";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: "Utkast", tone: "gray" },
  sent: { label: "Skickad", tone: "blue" },
  overdue: { label: "Förfallen", tone: "red" },
  paid: { label: "Betald", tone: "green" },
  credited: { label: "Krediterad", tone: "orange" },
};

export const INVOICE_UNITS = ["st", "tim", "mån", "dag", "år"];

// Raden som lagras i public.invoices (urval av kolumner som UI:t använder).
export type InvoiceRecord = {
  id: string;
  number: string;
  ocr: string | null;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_org_number: string | null;
  customer_address: string | null;
  reference: string | null;
  our_reference: string | null;
  issued_at: string | null;
  due_date: string | null;
  payment_terms_days: number | null;
  period_start: string | null;
  period_end: string | null;
  items: unknown;
  vat_rate: number | string | null;
  currency: string | null;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  amount_sek: number | string | null;
  message: string | null;
  notes: string | null;
  offer_id: string | null;
  agreement_id: string | null;
  project_id: string | null;
  credited_invoice_id: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
};

// Leverantörens fakturauppgifter (company_settings, migration 0034). Hämtas
// separat från CompanyInfo så att offert-/avtalsflödet inte påverkas om
// migrationen inte körts.
export type InvoiceSettings = {
  bankgiro: string;
  vatNumber: string;
  registeredOffice: string;
  fSkatt: boolean;
  paymentTermsDays: number;
  lateInterest: string;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  bankgiro: "",
  vatNumber: "",
  registeredOffice: "",
  fSkatt: true,
  paymentTermsDays: 30,
  lateInterest: "",
};

export const DEFAULT_LATE_INTEREST =
  "Vid betalning efter förfallodagen debiteras dröjsmålsränta enligt räntelagen.";

export function toInvoiceSettings(row: Record<string, any> | null | undefined): InvoiceSettings {
  if (!row) return { ...DEFAULT_INVOICE_SETTINGS };
  const terms = Number(row.payment_terms_days);
  return {
    bankgiro: row.bankgiro?.trim() || "",
    vatNumber: row.vat_number?.trim() || "",
    registeredOffice: row.registered_office?.trim() || "",
    fSkatt: row.f_skatt !== false,
    paymentTermsDays: Number.isFinite(terms) && terms >= 0 ? terms : 30,
    lateInterest: row.late_interest?.trim() || "",
  };
}

// ---------- Rader & totaler ----------

function num(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Avrunda till öre. EPSILON undviker att t.ex. 1.005 blir 1.00.
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : Math.sign(n) * r;
}

// Öresavrundning till hela kronor (50 öre och uppåt avrundas uppåt).
export function roundKr(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(Math.abs(n) + Number.EPSILON);
  return r === 0 ? 0 : Math.sign(n) * r;
}

export function newLineId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `line-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeLine(raw: any, fallbackId?: string): InvoiceLine {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : fallbackId ?? newLineId(),
    description: typeof raw?.description === "string" ? raw.description : "",
    quantity: raw?.quantity == null || raw.quantity === "" ? 1 : num(raw.quantity),
    unit: typeof raw?.unit === "string" ? raw.unit : "st",
    unit_price: num(raw?.unit_price),
    discount_pct: clampPct(num(raw?.discount_pct)),
  };
}

export function normalizeLines(raw: unknown): InvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => normalizeLine(r, `line-${i}`));
}

export function newEmptyLine(): InvoiceLine {
  return { id: newLineId(), description: "", quantity: 1, unit: "st", unit_price: 0, discount_pct: 0 };
}

export function lineAmount(l: InvoiceLine): number {
  return round2(l.quantity * l.unit_price * (1 - clampPct(l.discount_pct) / 100));
}

export type InvoiceTotals = {
  net: number;      // exkl. moms
  vat: number;
  gross: number;    // inkl. moms, före öresavrundning
  rounding: number; // öresavrundning
  toPay: number;    // att betala
};

export function computeInvoiceTotals(
  lines: InvoiceLine[],
  vatRate: number | string | null | undefined,
  currency: string | null | undefined = "SEK",
): InvoiceTotals {
  const net = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const vat = round2(net * (num(vatRate) / 100));
  const gross = round2(net + vat);
  // Öresavrundning bara för kronor — bankgiro/OCR hanterar endast SEK.
  const toPay = (currency ?? "SEK") === "SEK" ? roundKr(gross) : gross;
  return { net, vat, gross, rounding: round2(toPay - gross), toPay };
}

// Kreditfakturan speglar originalets rader med negativt antal.
export function creditLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.map((l) => ({ ...l, id: newLineId(), quantity: -l.quantity }));
}

// ---------- Status ----------

export function isInvoiceStatus(s: unknown): s is InvoiceStatus {
  return typeof s === "string" && s in INVOICE_STATUS;
}

// "Förfallen" räknas fram för skickade fakturor vars förfallodag passerat, så
// att ingen behöver flytta status för hand. Kreditfakturor förfaller aldrig.
export function effectiveStatus(
  inv: { status: string | null; due_date: string | null; credited_invoice_id?: string | null },
  today: string = todayISO(),
): InvoiceStatus {
  const s = isInvoiceStatus(inv.status) ? inv.status : "draft";
  if (s === "sent" && !inv.credited_invoice_id && inv.due_date && inv.due_date < today) {
    return "overdue";
  }
  return s;
}

// Obetald kundfordran: skickad/förfallen debetfaktura.
export function isOutstanding(inv: { status: string | null; credited_invoice_id?: string | null }): boolean {
  return !inv.credited_invoice_id && (inv.status === "sent" || inv.status === "overdue");
}

// ---------- Datum ----------

// Dagens datum i svensk tid som YYYY-MM-DD (oavsett serverns tidszon).
export function todayISO(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseISO(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function utcToISO(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDaysISO(iso: string | null | undefined, days: number): string {
  const p = iso ? parseISO(iso) : null;
  if (!p) return "";
  return utcToISO(Date.UTC(p[0], p[1] - 1, p[2] + days));
}

// Lägger till hela månader; dag 31 + 1 mån blir sista dagen i nästa månad.
export function addMonthsISO(iso: string | null | undefined, months: number): string {
  const p = iso ? parseISO(iso) : null;
  if (!p) return "";
  const lastDay = new Date(Date.UTC(p[0], p[1] - 1 + months + 1, 0)).getUTCDate();
  return utcToISO(Date.UTC(p[0], p[1] - 1 + months, Math.min(p[2], lastDay)));
}

// Sista dagen i en period som börjar på `start` och omfattar `months` månader.
export function periodEndISO(start: string, months: number): string {
  return addDaysISO(addMonthsISO(start, Math.max(1, months)), -1);
}

// Perioden direkt efter [start, end] med samma längd — används när en
// månadsfaktura dupliceras till nästa period. Hela månader behålls som hela
// månader (nov → dec), annars flyttas perioden lika många dagar.
export function nextPeriod(
  start: string | null,
  end: string | null,
): { start: string; end: string } | null {
  const s = start ? parseISO(start) : null;
  const e = end ? parseISO(end) : null;
  if (!s || !e || end! < start!) return null;
  const next = addDaysISO(end, 1);
  const n = parseISO(next)!;
  const months = (n[0] - s[0]) * 12 + (n[1] - s[1]);
  if (months >= 1 && n[2] === s[2]) return { start: next, end: periodEndISO(next, months) };
  const days = Math.round((Date.UTC(e[0], e[1] - 1, e[2]) - Date.UTC(s[0], s[1] - 1, s[2])) / 86400000);
  return { start: next, end: addDaysISO(next, days) };
}

export function firstOfNextMonthISO(from: string = todayISO()): string {
  const p = parseISO(from);
  if (!p) return "";
  return utcToISO(Date.UTC(p[0], p[1], 1));
}

// "2026-11-01 – 2026-11-30", eller ett enskilt datum.
export function periodLabel(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || "";
}

// ---------- Belopp ----------

// sv-SE formaterar negativa tal med U+2212 och kan använda smala mellanslag;
// normalisera till tecken som även PDF:ens standardtypsnitt kan rita.
function normalizeNumber(s: string): string {
  return s.replace(/−/g, "-").replace(/[  ]/g, " ");
}

export function fmtAmount(n: number | string | null | undefined): string {
  return normalizeNumber(
    new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      round2(num(n)),
    ),
  );
}

export function fmtQuantity(n: number): string {
  return normalizeNumber(new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(num(n)));
}

// ---------- OCR & bankgiro ----------

// Kontrollsiffra enligt Luhn (modulus 10) för siffrorna i `payload`.
export function luhnCheckDigit(payload: string): string {
  let total = 0;
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return String((10 - (total % 10)) % 10);
}

export function luhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  return luhnCheckDigit(digits.slice(0, -1)) === digits.slice(-1);
}

// OCR = fakturanumrets siffror + längdsiffra + kontrollsiffra.
export function invoiceOcr(number: string | null | undefined): string | null {
  const base = (number ?? "").replace(/\D/g, "");
  if (!base) return null;
  const payload = base + String((base.length + 2) % 10);
  return payload + luhnCheckDigit(payload);
}

export function bankgiroDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

// Bankgironummer är 7–8 siffror där den sista är en Luhn-kontrollsiffra.
export function isValidBankgiro(raw: string | null | undefined): boolean {
  const d = bankgiroDigits(raw);
  return (d.length === 7 || d.length === 8) && luhnValid(d);
}

// "1234567" → "123-4567", "12345678" → "1234-5678".
export function formatBankgiro(raw: string | null | undefined): string {
  const d = bankgiroDigits(raw);
  if (d.length === 7 || d.length === 8) return `${d.slice(0, -4)}-${d.slice(-4)}`;
  return (raw ?? "").trim();
}

// Momsregistreringsnummer för ett svenskt bolag: SE + orgnr (10 siffror) + 01.
export function suggestVatNumber(orgNumber: string | null | undefined): string {
  const d = (orgNumber ?? "").replace(/\D/g, "");
  if (d.length !== 10 && d.length !== 12) return "";
  return `SE${d.slice(-10)}01`;
}

// ---------- Import från offert ----------

export type OfferPricing = {
  project_items?: unknown;
  monthly_items?: unknown;
  project_price?: number | string | null;
  monthly_price?: number | string | null;
  project_discount_pct?: number | string | null;
  monthly_discount_pct?: number | string | null;
};

export function offerOneTimeItems(o: OfferPricing): OfferItem[] {
  return itemsOrFallback(
    normalizeItems(o.project_items),
    num(o.project_price),
    num(o.project_discount_pct),
    "Projektkostnad (engångsavgift)",
  );
}

export function offerMonthlyItems(o: OfferPricing): OfferItem[] {
  return itemsOrFallback(
    normalizeItems(o.monthly_items),
    num(o.monthly_price),
    num(o.monthly_discount_pct),
    "Underhållsavgift (per månad)",
  );
}

export function linesFromOfferItems(items: OfferItem[], quantity: number, unit: string): InvoiceLine[] {
  return items
    .filter((it) => it.description.trim() || it.unit_price)
    .map((it) => ({
      id: newLineId(),
      description: it.description,
      quantity,
      unit,
      unit_price: it.unit_price,
      discount_pct: it.discount_pct,
    }));
}

// ---------- Validering ----------

// Fält som måste finnas innan en faktura kan skickas (ML 17 kap. 24 § m.fl.).
// Tom lista = redo. Utkast och förhandsgranskning tillåts alltid.
export function missingForSend(
  inv: {
    customer_name: string | null;
    customer_address: string | null;
    issued_at: string | null;
    due_date: string | null;
    credited_invoice_id?: string | null;
  },
  lines: InvoiceLine[],
  company: { orgNumber: string; address: string },
  settings: InvoiceSettings,
): string[] {
  const isCredit = !!inv.credited_invoice_id;
  const missing: string[] = [];
  if (!inv.customer_name?.trim()) missing.push("Kundens namn");
  if (!inv.customer_address?.trim()) missing.push("Kundens adress");
  if (!inv.issued_at) missing.push("Fakturadatum");
  if (!isCredit && !inv.due_date) missing.push("Förfallodatum");
  if (lines.length === 0) missing.push("Minst en fakturarad");
  else if (lines.some((l) => !l.description.trim())) missing.push("Beskrivning på varje rad");
  if (!company.orgNumber) missing.push("Vårt organisationsnummer (Inställningar)");
  if (!company.address) missing.push("Vår adress (Inställningar)");
  if (!settings.vatNumber) missing.push("Vårt momsregistreringsnummer (Inställningar)");
  if (!isCredit && !bankgiroDigits(settings.bankgiro)) missing.push("Vårt bankgironummer (Inställningar)");
  return missing;
}

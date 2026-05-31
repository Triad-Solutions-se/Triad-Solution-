// Genererar en branded PDF av en offert med pdf-lib (Helvetica är inbyggd i
// PDF-standarden, inga filsystem-beroenden — fungerar serverless).
//
// pdf-lib använder bottom-up y-axel; vi håller intern "cursor" som top-down och
// konverterar i drawText/drawRect.

import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { CompanyInfo, companyFromLines } from "./company";

export const A4_W = 595.28;
export const A4_H = 841.89;
export const MARGIN = 32;
export const CONTENT_W = A4_W - MARGIN * 2;

// Färger (pdf-lib: rgb 0–1)
export const BRAND  = rgb(0/255,   180/255, 168/255); // #00B4A8
export const DARK   = rgb(10/255,  37/255,  64/255);  // #0A2540
export const LIGHT  = rgb(245/255, 245/255, 247/255); // #F5F5F7
export const GREY   = rgb(99/255,  99/255,  102/255); // #636366
export const ROSE   = rgb(185/255, 28/255,  28/255);  // #B91C1C
export const WHITE  = rgb(1, 1, 1);
export const BLACK  = rgb(0, 0, 0);
export const BORDER = rgb(213/255, 213/255, 218/255); // #D5D5DA
export const AMBER  = rgb(180/255, 83/255,  9/255);   // #B45309 (varningar)

export type OfferData = {
  offer_number: string | null;
  title: string | null;
  reference: string | null;
  offer_date: string;
  valid_until: string | null;
  project_description: string | null;
  project_price: number;
  monthly_price: number;
  project_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
  other_costs?: string | null;
  vat_rate: number;
  currency: string;
  customer?: {
    name: string | null;
    contact_person?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    org_number?: string | null;
    address?: string | null;
  } | null;
};

export function fmtDateSv(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("sv-SE");
}
export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}
export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// pdf-lib's WinAnsi-kodning täcker latin1 inklusive åäö men inte t.ex. emoji.
// Strippa karaktärer som inte kan kodas så vi inte kastar fel mitt i render.
const SUPPORTED = /[\x00-\x7E\xA0-\xFFŒœŠšŽžŸ–—‘’“”†‡•…‰‹›€™]/;
export function safe(text: string): string {
  let out = "";
  for (const ch of text) out += SUPPORTED.test(ch) ? ch : "?";
  return out;
}

export type DrawOpts = {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  width?: number;
  align?: "left" | "center" | "right";
};

export class Pdf {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  fontItalic: PDFFont;
  cursor: number = MARGIN; // top-down y

  constructor(
    doc: PDFDocument,
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    fontItalic: PDFFont,
  ) {
    this.doc = doc;
    this.page = page;
    this.font = font;
    this.fontBold = fontBold;
    this.fontItalic = fontItalic;
  }

  // Rita text med övre kanten på topY (top-down koordinater).
  drawText(text: string, x: number, topY: number, opts: DrawOpts = {}) {
    const font = opts.font ?? this.font;
    const size = opts.size ?? 10;
    const color = opts.color ?? BLACK;
    const s = safe(text);
    const w = font.widthOfTextAtSize(s, size);
    let dx = 0;
    if (opts.width) {
      if (opts.align === "right") dx = opts.width - w;
      else if (opts.align === "center") dx = (opts.width - w) / 2;
    }
    this.page.drawText(s, {
      x: x + dx,
      y: A4_H - topY - size * 0.8,
      size,
      font,
      color,
    });
  }

  drawRect(
    x: number,
    topY: number,
    width: number,
    height: number,
    fill: ReturnType<typeof rgb> | null,
    border?: { color: ReturnType<typeof rgb>; width: number },
  ) {
    this.page.drawRectangle({
      x,
      y: A4_H - topY - height,
      width,
      height,
      color: fill ?? undefined,
      borderColor: border?.color,
      borderWidth: border?.width,
    });
  }

  drawLine(x1: number, x2: number, topY: number, color: ReturnType<typeof rgb>, thickness = 1) {
    this.page.drawLine({
      start: { x: x1, y: A4_H - topY },
      end: { x: x2, y: A4_H - topY },
      thickness,
      color,
    });
  }

  drawImage(img: PDFImage, x: number, topY: number, width: number, height: number) {
    this.page.drawImage(img, {
      x,
      y: A4_H - topY - height,
      width,
      height,
    });
  }

  // Bryt text i ord-baserade rader som ryms i `maxWidth`. Bevarar explicita
  // radbrytningar i input.
  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const para of safe(text).split(/\r?\n/)) {
      if (!para) {
        lines.push("");
        continue;
      }
      const words = para.split(/\s+/);
      let line = "";
      for (const word of words) {
        const candidate = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  // Rita wrappad text och returnera y-positionen efter sista raden.
  drawWrapped(text: string, x: number, topY: number, opts: DrawOpts & { lineHeight?: number }) {
    const font = opts.font ?? this.font;
    const size = opts.size ?? 10;
    const lineHeight = opts.lineHeight ?? size * 1.35;
    const lines = this.wrap(text, font, size, opts.width ?? CONTENT_W);
    let y = topY;
    for (const line of lines) {
      this.drawText(line, x, y, opts);
      y += lineHeight;
    }
    return y;
  }

  newPageIfNeeded(needed: number) {
    if (this.cursor + needed > A4_H - MARGIN - 24) {
      this.newPage();
    }
  }

  newPage() {
    this.page = this.doc.addPage([A4_W, A4_H]);
    this.cursor = MARGIN;
  }

  get bottomLimit(): number {
    return A4_H - MARGIN - 24;
  }
}

// Ladda Triad-logon (valfri — faller tillbaka till text om filen saknas, t.ex.
// i serverless-miljö där public-mappen inte bundlas).
export async function loadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logos", "Logo_Color_with_text.png");
    const buf = await fs.readFile(logoPath);
    return await doc.embedPng(buf);
  } catch {
    return null;
  }
}

// Variant-konfiguration när drawOfferContent används för både offert och avtal.
// "agreement" rebrandar headern till AVTAL, byter detalj-boxar (avtalsdatum/
// startdatum istället för offertdatum/giltig till) och hoppar över de
// inbyggda VILLKOR- och GODKÄNNANDE-sektionerna (de ersätts av Villkor-bilagan
// som renderas separat).
export type OfferRenderVariant =
  | { kind: "offer" }
  | {
      kind: "agreement";
      agreementNumber: string | null;
      agreementDate: string; // ISO YYYY-MM-DD
      startDate: string;     // ISO YYYY-MM-DD
    };

// Ritar hela offertinnehållet på den aktiva sidan i `p`. Bryter sidor vid behov.
// Bryts ut så att samma innehåll kan följas av SaaS-avtalet / Villkor i samma PDF.
export function drawOfferContent(
  p: Pdf,
  offer: OfferData,
  logo: PDFImage | null,
  company: CompanyInfo,
  variant: OfferRenderVariant = { kind: "offer" },
) {
  const { font, fontBold, fontItalic } = p;
  const isAgreement = variant.kind === "agreement";

  // ====== HEADER ======
  if (logo) {
    // Logon är 1080x1080 (kvadratisk) — rita 70x70 för att behålla aspect ratio
    p.drawImage(logo, MARGIN, MARGIN, 70, 70);
  } else {
    p.drawText("TRIAD SOLUTIONS", MARGIN, MARGIN + 22, {
      font: fontBold, size: 22, color: BRAND,
    });
  }
  p.drawText(isAgreement ? "AVTAL" : "OFFERT", MARGIN, MARGIN + 8, {
    font: fontBold, size: 28, color: DARK,
    width: CONTENT_W, align: "right",
  });
  // Slogan visas bara på offerten — avtalsförsättet hålls renare.
  if (!isAgreement) {
    p.drawText("Skraddarsydd mjukvara for SMB", MARGIN, MARGIN + 42, {
      font: fontItalic, size: 9, color: BRAND,
      width: CONTENT_W, align: "right",
    });
  }

  // Teal divider
  const dividerY = MARGIN + 78;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, dividerY, BRAND, 2);
  p.cursor = dividerY + 16;

  // ====== FRÅN / TILL ======
  const colW = CONTENT_W / 2;
  p.drawText("FRÅN", MARGIN, p.cursor, { font: fontBold, size: 9, color: BRAND });
  p.drawText("TILL", MARGIN + colW, p.cursor, { font: fontBold, size: 9, color: BRAND });
  let fromY = p.cursor + 14;
  let toY = p.cursor + 14;

  const fromLines: [string, boolean][] = [
    [company.name, true],
    ...companyFromLines(company).map((l) => [l, false] as [string, boolean]),
  ];
  const toLines: [string, boolean][] = [
    [offer.customer?.name ?? "—", true],
    [offer.customer?.contact_person ? `Att: ${offer.customer.contact_person}` : "", false],
    [offer.customer?.org_number ? `Org.nr: ${offer.customer.org_number}` : "", false],
    [offer.customer?.address ? offer.customer.address.replace(/\s*\n\s*/g, ", ") : "", false],
    [offer.customer?.email ?? "", false],
    [offer.customer?.phone ?? "", false],
  ];

  for (const [text, bold] of fromLines) {
    if (text) {
      p.drawText(text, MARGIN, fromY, {
        font: bold ? fontBold : font, size: bold ? 11 : 10,
        color: bold ? BLACK : GREY, width: colW - 8,
      });
    }
    fromY += bold ? 16 : 13;
  }
  for (const [text, bold] of toLines) {
    if (text) {
      p.drawText(text, MARGIN + colW, toY, {
        font: bold ? fontBold : font, size: bold ? 11 : 10,
        color: bold ? BLACK : GREY, width: colW - 8,
      });
    }
    toY += bold ? 16 : 13;
  }
  p.cursor = Math.max(fromY, toY) + 6;

  // ====== DETALJBOXAR ======
  const boxes = isAgreement
    ? [
        { label: "AVTALSNUMMER", value: variant.agreementNumber ?? "—" },
        { label: "AVTALSDATUM", value: fmtDateSv(variant.agreementDate) },
        { label: "AVTALSSTART", value: fmtDateSv(variant.startDate) },
        { label: "ER REFERENS", value: offer.reference ?? "—" },
      ]
    : [
        { label: "OFFERTNUMMER", value: offer.offer_number ?? "—" },
        { label: "OFFERTDATUM", value: fmtDateSv(offer.offer_date) },
        { label: "GILTIG TILL", value: fmtDateSv(offer.valid_until) },
        { label: "ER REFERENS", value: offer.reference ?? "—" },
      ];
  const boxW = CONTENT_W / 4;
  const boxH = 46;
  for (let i = 0; i < boxes.length; i++) {
    const bx = MARGIN + i * boxW;
    p.drawRect(bx, p.cursor, boxW - 4, boxH, LIGHT);
    p.drawText(boxes[i].label, bx + 8, p.cursor + 8, {
      font: fontBold, size: 7, color: GREY,
    });
    p.drawText(boxes[i].value, bx + 8, p.cursor + 22, {
      font: fontBold, size: 11, color: DARK, width: boxW - 16,
    });
  }
  p.cursor += boxH + 18;

  // ====== PROJEKTBESKRIVNING ======
  p.cursor = drawSectionHeading(p, "PROJEKTBESKRIVNING", p.cursor);
  if (offer.project_description) {
    const endY = p.drawWrapped(offer.project_description, MARGIN, p.cursor, {
      size: 10, color: BLACK, width: CONTENT_W,
    });
    p.cursor = endY + 8;
  } else {
    p.drawText("—", MARGIN, p.cursor, { color: GREY });
    p.cursor += 16;
  }

  // ====== PRISER ======
  // Beräkna alla pris-värden upfront så vi kan layouta korten parallellt.
  const projPrice = offer.project_price ?? 0;
  const monthPrice = offer.monthly_price ?? 0;
  const projDiscPct = clampPct(Number(offer.project_discount_pct ?? 0));
  const monthDiscPct = clampPct(Number(offer.monthly_discount_pct ?? 0));
  const vat = offer.vat_rate ?? 25;

  const projDiscount = projPrice * (projDiscPct / 100);
  const projAfter = projPrice - projDiscount;
  const projVat = projAfter * (vat / 100);
  const projTotal = projAfter + projVat;
  const monthDiscount = monthPrice * (monthDiscPct / 100);
  const monthAfter = monthPrice - monthDiscount;
  const monthVat = monthAfter * (vat / 100);
  const monthTotal = monthAfter + monthVat;

  p.newPageIfNeeded(240);
  p.cursor = drawSectionHeading(p, "PRISER", p.cursor);

  // Två kort sida vid sida — engångskostnad (DARK accent) + månad (BRAND).
  const cardGap = 14;
  const cardW = (CONTENT_W - cardGap) / 2;
  const projBottom = drawPricingCard(p, {
    x: MARGIN,
    y: p.cursor,
    w: cardW,
    accent: DARK,
    title: "ENGÅNGSKOSTNAD",
    subtitle: "faktureras vid projektstart",
    unit: projPrice,
    discount: projDiscount,
    discountPct: projDiscPct,
    afterDiscount: projAfter,
    vat: projVat,
    total: projTotal,
    vatRate: vat,
    currency: offer.currency,
    totalLabel: "TOTALT INKL. MOMS",
  });
  const monthBottom = drawPricingCard(p, {
    x: MARGIN + cardW + cardGap,
    y: p.cursor,
    w: cardW,
    accent: BRAND,
    title: "ÅTERKOMMANDE",
    subtitle: "faktureras månadsvis",
    unit: monthPrice,
    discount: monthDiscount,
    discountPct: monthDiscPct,
    afterDiscount: monthAfter,
    vat: monthVat,
    total: monthTotal,
    vatRate: vat,
    currency: offer.currency,
    totalLabel: "PER MÅNAD INKL. MOMS",
    footnote: `Årskostnad inkl. moms: ${fmtMoney(monthTotal * 12)} ${offer.currency}`,
  });
  p.cursor = Math.max(projBottom, monthBottom) + 14;

  // ====== ÖVRIGA KOSTNADER (conditional) ======
  if (offer.other_costs && offer.other_costs.trim()) {
    p.newPageIfNeeded(80);
    p.cursor = drawSectionHeading(p, "ÖVRIGA KOSTNADER", p.cursor);
    const endY = p.drawWrapped(offer.other_costs, MARGIN, p.cursor, {
      size: 10, color: BLACK, width: CONTENT_W,
    });
    p.cursor = endY + 4;
    p.drawText(
      "Ovanstående kostnader är rörliga / villkorade och ingår inte i totalsumman ovan.",
      MARGIN, p.cursor,
      { font: fontItalic, size: 9, color: GREY, width: CONTENT_W },
    );
    p.cursor += 22;
  }

  // ====== GODKÄNNANDE (endast offert-variant) ======
  if (!isAgreement) {
    p.newPageIfNeeded(160);
    p.cursor = drawSectionHeading(p, "GODKÄNNANDE", p.cursor);
    p.drawText(
      "Vänligen returnera signerad offert till info@triadsolutions.se för att bekräfta beställningen.",
      MARGIN, p.cursor,
      { size: 10, color: GREY, width: CONTENT_W },
    );
    p.cursor += 30;

    const sigW = (CONTENT_W - 30) / 2;
    drawSignatureBlock(p, MARGIN, p.cursor, sigW, "Underskrift — För Triad Solutions");
    drawSignatureBlock(p, MARGIN + sigW + 30, p.cursor, sigW, "Underskrift — För kunden");

    // Footer (bottom of current page)
    p.drawText("Tack för förtroendet!", MARGIN, A4_H - MARGIN - 16, {
      font: fontItalic, size: 11, color: BRAND, width: CONTENT_W, align: "center",
    });
  }
}

export function drawSectionHeading(p: Pdf, label: string, topY: number): number {
  p.drawText(label, MARGIN, topY, {
    font: p.fontBold, size: 11, color: DARK,
  });
  const lineY = topY + 16;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, lineY, BRAND, 1.5);
  return lineY + 8;
}

function drawSignatureBlock(p: Pdf, x: number, topY: number, w: number, label: string) {
  p.drawLine(x, x + w, topY, BLACK, 0.5);
  p.drawText("Ort och datum", x, topY + 4, {
    font: p.font, size: 8, color: GREY,
  });
  const sigY = topY + 40;
  p.drawLine(x, x + w, sigY, BLACK, 0.5);
  p.drawText(label, x, sigY + 4, { font: p.font, size: 8, color: GREY });
  p.drawText("[Namnförtydligande]", x, sigY + 16, { font: p.font, size: 8, color: GREY });
}

// Kort med pris-uppdelning: header (accent-strip + titel + undertitel),
// breakdown-rader (delsumma, ev. rabatt, ev. efter rabatt, moms), färgad
// total-rad i botten, och valfri fotnot. Returnerar y-koordinaten just under
// kortet så caller kan synca side-by-side-höjd.
type PricingCardInput = {
  x: number;
  y: number;
  w: number;
  accent: ReturnType<typeof rgb>;
  title: string;
  subtitle: string;
  unit: number;
  discount: number;
  discountPct: number;
  afterDiscount: number;
  vat: number;
  total: number;
  vatRate: number;
  currency: string;
  totalLabel: string;
  footnote?: string;
};

function drawPricingCard(p: Pdf, c: PricingCardInput): number {
  const padX = 12;
  const headerH = 38;
  const rowH = 18;
  const totalH = 36;
  const footH = c.footnote ? 18 : 0;

  // Bygg radlista (varierar beroende på om rabatt finns)
  type Row = { label: string; value: string; tone?: ReturnType<typeof rgb>; bold?: boolean };
  const rows: Row[] = [
    { label: "Delsumma", value: fmtMoney(c.unit) },
  ];
  if (c.discountPct > 0) {
    rows.push({
      label: `Rabatt (${c.discountPct} %)`,
      value: `-${fmtMoney(c.discount)}`,
      tone: ROSE,
    });
    rows.push({
      label: "Efter rabatt",
      value: fmtMoney(c.afterDiscount),
      bold: true,
    });
  }
  rows.push({ label: `Moms (${c.vatRate} %)`, value: fmtMoney(c.vat) });

  const bodyH = rows.length * rowH + 8;
  const cardH = headerH + bodyH + totalH + footH;

  // Ram + bakgrund
  p.drawRect(c.x, c.y, c.w, cardH, LIGHT, { color: BORDER, width: 0.5 });
  // Accent-strip i topp
  p.drawRect(c.x, c.y, c.w, 3, c.accent);

  // Titel + undertitel
  p.drawText(c.title, c.x + padX, c.y + 13, {
    font: p.fontBold, size: 10, color: DARK, width: c.w - padX * 2,
  });
  p.drawText(c.subtitle, c.x + padX, c.y + 26, {
    font: p.fontItalic, size: 8, color: GREY, width: c.w - padX * 2,
  });

  // Body-rader
  let ry = c.y + headerH;
  for (const r of rows) {
    p.drawText(r.label, c.x + padX, ry + 5, {
      size: 9, color: r.tone ?? BLACK,
      font: r.bold ? p.fontBold : p.font,
      width: c.w * 0.55,
    });
    p.drawText(r.value, c.x + padX, ry + 5, {
      size: 9, color: r.tone ?? BLACK,
      font: r.bold ? p.fontBold : p.font,
      width: c.w - padX * 2, align: "right",
    });
    p.drawLine(c.x + padX, c.x + c.w - padX, ry + rowH - 0.5, BORDER, 0.3);
    ry += rowH;
  }
  ry += 8; // padding mot total-raden

  // Total-rad (accent bg, vit text)
  p.drawRect(c.x, ry, c.w, totalH, c.accent);
  p.drawText(c.totalLabel, c.x + padX, ry + 11, {
    font: p.fontBold, size: 9, color: WHITE, width: c.w * 0.55,
  });
  p.drawText(`${fmtMoney(c.total)} ${c.currency}`, c.x + padX, ry + 9, {
    font: p.fontBold, size: 14, color: WHITE, width: c.w - padX * 2, align: "right",
  });
  ry += totalH;

  // Fotnot (t.ex. årskostnad)
  if (c.footnote) {
    p.drawText(c.footnote, c.x + padX, ry + 5, {
      font: p.fontItalic, size: 8, color: GREY, width: c.w - padX * 2, align: "right",
    });
    ry += footH;
  }

  return ry;
}

// Genererar en branded PDF av en offert med pdf-lib (Helvetica är inbyggd i
// PDF-standarden, inga filsystem-beroenden — fungerar serverless).
//
// pdf-lib använder bottom-up y-axel; vi håller intern "cursor" som top-down och
// konverterar i drawText/drawRect.

import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { CompanyInfo, companyFromLines } from "./company";
import {
  type OfferItem,
  computeSectionTotals,
  itemsOrFallback,
} from "./offer-items";

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
  // Valfri extra-sektion (egen rubrik + text) som visas efter beskrivningen.
  custom_header?: string | null;
  custom_text?: string | null;
  // Legacy enkel-pris-fält. Behålls för bakåtkompatibilitet (rendererarna
  // faller tillbaka till dem om items-arrayen är tom) och som "delsumma"
  // för listvyn.
  project_price: number;
  monthly_price: number;
  project_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
  // Nya line items — sektionens "sanna" innehåll om de finns.
  project_items?: OfferItem[];
  monthly_items?: OfferItem[];
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

  // ====== EXTRA INFORMATION (valfri, per offert) ======
  const customHeader = offer.custom_header?.trim();
  const customText = offer.custom_text?.trim();
  if (customHeader || customText) {
    p.newPageIfNeeded(80);
    p.cursor = drawSectionHeading(p, customHeader || "EXTRA INFORMATION", p.cursor);
    if (customText) {
      const endY = p.drawWrapped(customText, MARGIN, p.cursor, {
        size: 10, color: BLACK, width: CONTENT_W,
      });
      p.cursor = endY + 8;
    }
  }

  // ====== PRISER ======
  // Börja alltid prissektionen på en ny sida.
  p.newPage();

  const vat = offer.vat_rate ?? 25;
  const projectItems = itemsOrFallback(
    offer.project_items ?? [],
    Number(offer.project_price ?? 0),
    Number(offer.project_discount_pct ?? 0),
    "Projektkostnad (engångsavgift)",
  );
  const monthlyItems = itemsOrFallback(
    offer.monthly_items ?? [],
    Number(offer.monthly_price ?? 0),
    Number(offer.monthly_discount_pct ?? 0),
    "Underhållsavgift (per månad)",
  );

  p.cursor = drawSectionHeading(p, "PRISER", p.cursor);

  if (projectItems.length > 0) {
    p.cursor = drawPricingSection(p, {
      title: "ENGÅNGSKOSTNAD",
      subtitle: "faktureras vid projektstart",
      accent: DARK,
      items: projectItems,
      vatRate: vat,
      currency: offer.currency,
      totalLabel: "TOTALT INKL. MOMS",
    });
    p.cursor += 14;
  }

  if (monthlyItems.length > 0) {
    const monthTotals = computeSectionTotals(monthlyItems, vat);
    p.cursor = drawPricingSection(p, {
      title: "ÅTERKOMMANDE",
      subtitle: "faktureras månadsvis",
      accent: BRAND,
      items: monthlyItems,
      vatRate: vat,
      currency: offer.currency,
      totalLabel: "PER MÅNAD INKL. MOMS",
      footnote: `Årskostnad inkl. moms: ${fmtMoney(monthTotals.total * 12)} ${offer.currency}`,
    });
    p.cursor += 14;
  }

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

// Prissektion med valbar mängd line items. Renderar:
//   - Header (accent-strip + titel + undertitel)
//   - Tabellrubrik (Beskrivning | À-pris | Rabatt | Belopp)
//   - En rad per item, med per-rad netto efter ev. rabatt
//   - Summa-block (delsumma → ev. rabatt → ev. efter rabatt → moms)
//   - Färgad total-rad
//   - Valfri fotnot
//
// Sidbrytar mellan items om sektionen är längre än sidan medger; returnerar
// y-koordinaten under sista raden så caller kan fortsätta layouten.
type PricingSectionInput = {
  title: string;
  subtitle: string;
  accent: ReturnType<typeof rgb>;
  items: OfferItem[];
  vatRate: number;
  currency: string;
  totalLabel: string;
  footnote?: string;
};

function drawPricingSection(p: Pdf, c: PricingSectionInput): number {
  const padX = 12;
  const rowH = 18;
  const x = MARGIN;
  const w = CONTENT_W;
  const totals = computeSectionTotals(c.items, c.vatRate);
  const hasDiscount = totals.discount > 0;

  // Fyra kolumner med egna ankarpunkter så À-pris / Rabatt / Belopp inte
  // hamnar ovanpå varandra. De tre sista är högerjusterade mot sin egen
  // högerkant.
  const colDesc = padX;          // Beskrivning (vänsterjust.)
  const colUnit = w * 0.48;      // À-pris
  const colDisc = w * 0.66;      // Rabatt
  const colAmt  = w * 0.80;      // Belopp
  const rightEdge = w - padX;    // tabellens högerkant
  const colGap = 6;
  const colTextW = w - padX * 2;

  let y = p.cursor;

  // Sidbrytar-helper: synka p.cursor med vår lokala y innan vi frågar om en
  // ny sida. Om en ny sida öppnas hoppar y tillbaka till nya margin-toppen.
  const pageBreak = (needed: number) => {
    p.cursor = y;
    p.newPageIfNeeded(needed);
    if (p.cursor !== y) y = p.cursor;
  };

  // ===== Header (accent-strip + titel) =====
  // Reservera nog för header + tabellrubrik + minst en rad så headern
  // inte hänger ensam i sidfoten.
  pageBreak(38 + 16 + rowH);
  p.drawRect(x, y, w, 38, LIGHT, { color: BORDER, width: 0.5 });
  p.drawRect(x, y, w, 3, c.accent);
  p.drawText(c.title, x + padX, y + 13, {
    font: p.fontBold, size: 10, color: DARK, width: colTextW,
  });
  p.drawText(c.subtitle, x + padX, y + 26, {
    font: p.fontItalic, size: 8, color: GREY, width: colTextW,
  });
  y += 38;

  // ===== Tabellrubrik =====
  p.drawRect(x, y, w, 16, rgb(0.97, 0.97, 0.98), { color: BORDER, width: 0.5 });
  p.drawText("Beskrivning", x + colDesc, y + 4, {
    font: p.fontBold, size: 8, color: GREY,
  });
  p.drawText("À-pris", x + colUnit, y + 4, {
    font: p.fontBold, size: 8, color: GREY,
    width: colDisc - colUnit - colGap, align: "right",
  });
  p.drawText("Rabatt", x + colDisc, y + 4, {
    font: p.fontBold, size: 8, color: GREY,
    width: colAmt - colDisc - colGap, align: "right",
  });
  p.drawText("Belopp", x + colAmt, y + 4, {
    font: p.fontBold, size: 8, color: GREY,
    width: rightEdge - colAmt, align: "right",
  });
  y += 16;

  // Beskrivningar är vänsterjusterade och klipps inte automatiskt av
  // drawText — korta av med ellips så de inte rinner in i À-pris-kolumnen.
  const descMaxW = colUnit - colDesc - colGap;
  const ellipsize = (text: string): string => {
    const s = text || "—";
    if (p.font.widthOfTextAtSize(s, 9) <= descMaxW) return s;
    let t = s;
    while (t.length > 1 && p.font.widthOfTextAtSize(t + "…", 9) > descMaxW) {
      t = t.slice(0, -1);
    }
    return t.trimEnd() + "…";
  };

  // ===== Items =====
  for (const it of c.items) {
    pageBreak(rowH);
    const lineNet = it.unit_price * (1 - it.discount_pct / 100);
    p.drawRect(x, y, w, rowH, WHITE, { color: BORDER, width: 0.3 });
    p.drawText(ellipsize(it.description), x + colDesc, y + 5, {
      size: 9, color: BLACK, width: descMaxW,
    });
    p.drawText(fmtMoney(it.unit_price), x + colUnit, y + 5, {
      size: 9, color: BLACK, width: colDisc - colUnit - colGap, align: "right",
    });
    p.drawText(
      it.discount_pct > 0 ? `${trimPct(it.discount_pct)} %` : "—",
      x + colDisc, y + 5,
      {
        size: 9,
        color: it.discount_pct > 0 ? ROSE : GREY,
        width: colAmt - colDisc - colGap,
        align: "right",
      },
    );
    p.drawText(fmtMoney(lineNet), x + colAmt, y + 5, {
      font: p.fontBold, size: 9, color: BLACK,
      width: rightEdge - colAmt, align: "right",
    });
    y += rowH;
  }

  // ===== Summa-block =====
  // Total-rad + ev. rabatt-rader får inte splittas. Räkna upp behovet och be
  // om sidbyte i ett svep.
  const sumRowsCount = 1 /* delsumma */ + (hasDiscount ? 2 : 0) + 1 /* moms */;
  const totalH = 32;
  pageBreak(sumRowsCount * rowH + totalH + (c.footnote ? 16 : 0));

  const sumRow = (label: string, value: string, tone?: ReturnType<typeof rgb>, bold?: boolean) => {
    p.drawRect(x, y, w, rowH, LIGHT, { color: BORDER, width: 0.3 });
    p.drawText(label, x + padX, y + 5, {
      size: 9, color: tone ?? BLACK,
      font: bold ? p.fontBold : p.font,
      width: w * 0.55,
    });
    p.drawText(value, x + padX, y + 5, {
      size: 9, color: tone ?? BLACK,
      font: bold ? p.fontBold : p.font,
      width: colTextW, align: "right",
    });
    y += rowH;
  };

  sumRow("Delsumma", fmtMoney(totals.subtotal));
  if (hasDiscount) {
    sumRow("Total rabatt", `-${fmtMoney(totals.discount)}`, ROSE);
    sumRow("Efter rabatt", fmtMoney(totals.afterDiscount), undefined, true);
  }
  sumRow(`Moms (${c.vatRate} %)`, fmtMoney(totals.vat));

  // ===== Total-rad =====
  p.drawRect(x, y, w, totalH, c.accent);
  p.drawText(c.totalLabel, x + padX, y + 10, {
    font: p.fontBold, size: 10, color: WHITE, width: w * 0.55,
  });
  p.drawText(`${fmtMoney(totals.total)} ${c.currency}`, x + padX, y + 7, {
    font: p.fontBold, size: 14, color: WHITE, width: colTextW, align: "right",
  });
  y += totalH;

  // ===== Fotnot =====
  if (c.footnote) {
    p.drawText(c.footnote, x + padX, y + 5, {
      font: p.fontItalic, size: 8, color: GREY, width: colTextW, align: "right",
    });
    y += 16;
  }

  return y;
}

function trimPct(n: number): string {
  // Skriv ut 10 i stället för 10.00 men behåll decimaler om de finns.
  const s = String(Math.round(n * 100) / 100);
  return s;
}

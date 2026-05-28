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

// Ritar hela offertinnehållet på den aktiva sidan i `p`. Bryter sidor vid behov.
// Bryts ut så att samma innehåll kan följas av SaaS-avtalet i samma PDF.
export function drawOfferContent(
  p: Pdf,
  offer: OfferData,
  logo: PDFImage | null,
  company: CompanyInfo,
) {
  const { font, fontBold, fontItalic } = p;

  // ====== HEADER ======
  if (logo) {
    // Logon är 1080x1080 (kvadratisk) — rita 70x70 för att behålla aspect ratio
    p.drawImage(logo, MARGIN, MARGIN, 70, 70);
  } else {
    p.drawText("TRIAD SOLUTIONS", MARGIN, MARGIN + 22, {
      font: fontBold, size: 22, color: BRAND,
    });
  }
  p.drawText("OFFERT", MARGIN, MARGIN + 8, {
    font: fontBold, size: 28, color: DARK,
    width: CONTENT_W, align: "right",
  });
  p.drawText("Skraddarsydd mjukvara for SMB", MARGIN, MARGIN + 42, {
    font: fontItalic, size: 9, color: BRAND,
    width: CONTENT_W, align: "right",
  });

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
  const boxes = [
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

  // ====== SPECIFIKATION ======
  p.newPageIfNeeded(140);
  p.cursor = drawSectionHeading(p, "SPECIFIKATION", p.cursor);

  // Tabellbredder
  const cBeskrivning = { x: MARGIN, w: 260 };
  const cAntal       = { x: MARGIN + 260, w: 60 };
  const cApris       = { x: MARGIN + 320, w: 100 };
  const cBelopp      = { x: MARGIN + 420, w: CONTENT_W - 420 };

  const rowH = 22;
  // Header
  p.drawRect(MARGIN, p.cursor, CONTENT_W, rowH, DARK);
  p.drawText("Beskrivning", cBeskrivning.x + 6, p.cursor + 7, {
    font: fontBold, size: 9, color: WHITE, width: cBeskrivning.w - 12,
  });
  p.drawText("Antal", cAntal.x, p.cursor + 7, {
    font: fontBold, size: 9, color: WHITE, width: cAntal.w, align: "center",
  });
  p.drawText(`À-pris (${offer.currency})`, cApris.x, p.cursor + 7, {
    font: fontBold, size: 9, color: WHITE, width: cApris.w - 6, align: "right",
  });
  p.drawText(`Belopp (${offer.currency})`, cBelopp.x, p.cursor + 7, {
    font: fontBold, size: 9, color: WHITE, width: cBelopp.w - 6, align: "right",
  });
  p.cursor += rowH;

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

  const drawSpecRow = (
    desc: string,
    qty: number,
    unit: number,
    amount: number,
    bg: ReturnType<typeof rgb> | null,
  ) => {
    if (bg) p.drawRect(MARGIN, p.cursor, CONTENT_W, rowH, bg);
    // borders
    p.drawLine(MARGIN, MARGIN + CONTENT_W, p.cursor, BORDER, 0.5);
    p.drawLine(MARGIN, MARGIN + CONTENT_W, p.cursor + rowH, BORDER, 0.5);
    p.drawText(desc, cBeskrivning.x + 6, p.cursor + 7, {
      font: fontBold, size: 10, width: cBeskrivning.w - 12,
    });
    p.drawText(String(qty), cAntal.x, p.cursor + 7, {
      size: 10, width: cAntal.w, align: "center",
    });
    p.drawText(fmtMoney(unit), cApris.x, p.cursor + 7, {
      size: 10, width: cApris.w - 6, align: "right",
    });
    p.drawText(fmtMoney(amount), cBelopp.x, p.cursor + 7, {
      font: fontBold, size: 10, width: cBelopp.w - 6, align: "right",
    });
    p.cursor += rowH;
  };

  drawSpecRow("Projektkostnad (engångsavgift)", 1, projPrice, projPrice, null);
  drawSpecRow("Underhållsavgift (per månad)", 1, monthPrice, monthPrice, LIGHT);
  p.cursor += 14;

  // ====== ENGÅNGSKOSTNAD ======
  p.newPageIfNeeded(140);
  p.cursor = drawSubsectionHeading(p, "ENGÅNGSKOSTNAD (faktureras vid projektstart)", p.cursor);

  const totalsLabelX = MARGIN + 220;
  const totalsLabelW = 240;
  const totalsValueX = MARGIN + 460;
  const totalsValueW = CONTENT_W - 460 + MARGIN - 8;

  const drawTotalRow = (
    label: string,
    value: string,
    opts: { highlight?: ReturnType<typeof rgb>; tone?: ReturnType<typeof rgb>; divider?: boolean } = {},
  ) => {
    const h = opts.highlight ? 24 : 18;
    if (opts.highlight) {
      p.drawRect(totalsLabelX, p.cursor, CONTENT_W - 220 + MARGIN, h, opts.highlight);
      p.drawText(label, totalsLabelX + 8, p.cursor + 7, {
        font: fontBold, size: 11, color: WHITE, width: totalsLabelW - 16, align: "right",
      });
      p.drawText(value, totalsValueX, p.cursor + 7, {
        font: fontBold, size: 11, color: WHITE, width: totalsValueW, align: "right",
      });
    } else {
      p.drawText(label, totalsLabelX, p.cursor + 5, {
        font: fontBold, size: 10, color: opts.tone ?? BLACK,
        width: totalsLabelW, align: "right",
      });
      p.drawText(value, totalsValueX, p.cursor + 5, {
        size: 10, color: opts.tone ?? BLACK,
        width: totalsValueW, align: "right",
      });
      if (opts.divider) {
        p.drawLine(totalsLabelX, MARGIN + CONTENT_W, p.cursor + h - 1, BORDER, 0.5);
      }
    }
    p.cursor += h;
  };

  drawTotalRow("Delsumma", fmtMoney(projPrice), { divider: true });
  if (projDiscPct > 0) {
    drawTotalRow(`Rabatt (${projDiscPct} %)`, `-${fmtMoney(projDiscount)}`, {
      divider: true, tone: ROSE,
    });
    drawTotalRow("Efter rabatt", fmtMoney(projAfter), { divider: true });
  }
  drawTotalRow(`Moms (${vat} %)`, fmtMoney(projVat), { divider: true });
  drawTotalRow("TOTALT (inkl. moms)", `${fmtMoney(projTotal)} ${offer.currency}`, {
    highlight: DARK,
  });
  p.cursor += 12;

  // ====== MÅNADSKOSTNAD ======
  p.newPageIfNeeded(160);
  p.cursor = drawSubsectionHeading(p, "ÅTERKOMMANDE MÅNADSKOSTNAD (faktureras månadsvis)", p.cursor);

  drawTotalRow("Per månad exkl. moms", fmtMoney(monthPrice), { divider: true });
  if (monthDiscPct > 0) {
    drawTotalRow(`Rabatt (${monthDiscPct} %)`, `-${fmtMoney(monthDiscount)}`, {
      divider: true, tone: ROSE,
    });
    drawTotalRow("Per månad efter rabatt", fmtMoney(monthAfter), { divider: true });
  }
  drawTotalRow(`Moms (${vat} %)`, fmtMoney(monthVat), { divider: true });
  drawTotalRow("PER MÅNAD (inkl. moms)", `${fmtMoney(monthTotal)} ${offer.currency}`, {
    highlight: BRAND,
  });

  // Årskostnad (info-rad)
  p.drawText("Årskostnad (inkl. moms)", totalsLabelX, p.cursor + 5, {
    font: fontItalic, size: 9, color: GREY, width: totalsLabelW, align: "right",
  });
  p.drawText(`${fmtMoney(monthTotal * 12)} ${offer.currency}`, totalsValueX, p.cursor + 5, {
    font: fontItalic, size: 9, color: GREY, width: totalsValueW, align: "right",
  });
  p.cursor += 22;

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

  // ====== VILLKOR ======
  p.newPageIfNeeded(200);
  p.cursor = drawSectionHeading(p, "VILLKOR", p.cursor);

  const villkor: [string, string][] = [
    ["Betalningsvillkor:", "30 dagar netto från fakturadatum."],
    ["Giltighetstid:", `Offerten är giltig till ${fmtDateSv(offer.valid_until)}.`],
    ["Leveranstid:", "[Ange uppskattad leveranstid eller projektplan]."],
    ["Priser:", `Samtliga priser anges exklusive moms i ${offer.currency}.`],
    ["Ändringar:", "Tilläggsarbeten utöver specifikationen debiteras separat enligt timpris [XXX SEK/h]."],
    ["Underhåll:", "Avtalstid 12 mån, därefter löpande med 3 mån uppsägningstid om inget annat avtalats."],
    ["Resor/utlägg:", "Eventuella resor och utlägg debiteras enligt självkostnadsprincipen."],
    ["Övrigt:", "I övrigt gäller ALOS 05 (Allmänna leveransbestämmelser)."],
  ];
  for (const [label, text] of villkor) {
    p.newPageIfNeeded(24);
    p.drawText(`• ${label}`, MARGIN, p.cursor, {
      font: fontBold, size: 10, width: 110,
    });
    const endY = p.drawWrapped(text, MARGIN + 115, p.cursor, {
      size: 10, color: BLACK, width: CONTENT_W - 115,
    });
    p.cursor = Math.max(p.cursor + 16, endY + 4);
  }
  p.cursor += 8;

  // ====== GODKÄNNANDE ======
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

export function drawSectionHeading(p: Pdf, label: string, topY: number): number {
  p.drawText(label, MARGIN, topY, {
    font: p.fontBold, size: 11, color: DARK,
  });
  const lineY = topY + 16;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, lineY, BRAND, 1.5);
  return lineY + 8;
}

function drawSubsectionHeading(p: Pdf, label: string, topY: number): number {
  p.drawText(label, MARGIN, topY, {
    font: p.fontBold, size: 10, color: DARK,
  });
  const lineY = topY + 14;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, lineY, DARK, 0.5);
  return lineY + 6;
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

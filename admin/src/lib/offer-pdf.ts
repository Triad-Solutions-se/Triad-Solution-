// Genererar en branded PDF av en offert. Layout speglar Excel-mallen så att
// utskick blir konsekvent oavsett format. Använder pdfkit (server-only).
//
// pdfkit har inga Calibri-fonts inbyggda — vi använder Helvetica som täcker
// åäö korrekt via WinAnsi. Färger och struktur följer offer-xlsx.ts.

import PDFDocument from "pdfkit";
import fs from "node:fs/promises";
import path from "node:path";

const BRAND = "#00B4A8";
const DARK = "#0A2540";
const LIGHT = "#F5F5F7";
const GREY = "#636366";
const ROSE = "#B91C1C";
const TEXT = "#000000";

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_ITALIC = "Helvetica-Oblique";

// A4 portrait
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;

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
  } | null;
};

function fmtDateSv(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("sv-SE");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export async function generateOfferPdf(offer: OfferData): Promise<Uint8Array> {
  // Försök läsa logo
  let logoBuf: Buffer | null = null;
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logos", "Logo_Color_with_text.png");
    logoBuf = await fs.readFile(logoPath);
  } catch {
    /* fallback to text */
  }

  // Räkna ut totaler i förväg
  const vat = offer.vat_rate ?? 25;
  const projPrice = offer.project_price ?? 0;
  const monthPrice = offer.monthly_price ?? 0;
  const projDiscPct = clampPct(Number(offer.project_discount_pct ?? 0));
  const monthDiscPct = clampPct(Number(offer.monthly_discount_pct ?? 0));

  const projDiscount = projPrice * (projDiscPct / 100);
  const projAfter = projPrice - projDiscount;
  const projVat = projAfter * (vat / 100);
  const projTotal = projAfter + projVat;

  const monthDiscount = monthPrice * (monthDiscPct / 100);
  const monthAfter = monthPrice - monthDiscount;
  const monthVat = monthAfter * (vat / 100);
  const monthTotal = monthAfter + monthVat;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      info: {
        Title: `Offert ${offer.offer_number ?? ""}`.trim(),
        Author: "Triad Solutions",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);

    // ====== HEADER ======
    const headerY = MARGIN;
    if (logoBuf) {
      // Logon är 1080x1080 (square) — rendera 70x70 så aspect ratio behålls
      doc.image(logoBuf, MARGIN, headerY, { width: 70, height: 70 });
    } else {
      doc
        .font(FONT_BOLD)
        .fontSize(22)
        .fillColor(BRAND)
        .text("TRIAD SOLUTIONS", MARGIN, headerY + 20);
    }

    doc
      .font(FONT_BOLD)
      .fontSize(28)
      .fillColor(DARK)
      .text("OFFERT", MARGIN, headerY + 10, {
        width: CONTENT_W,
        align: "right",
      });
    doc
      .font(FONT_ITALIC)
      .fontSize(9)
      .fillColor(BRAND)
      .text("Skräddarsydd mjukvara för SMB", MARGIN, headerY + 42, {
        width: CONTENT_W,
        align: "right",
      });

    // Teal divider
    const dividerY = headerY + 78;
    doc
      .moveTo(MARGIN, dividerY)
      .lineTo(MARGIN + CONTENT_W, dividerY)
      .strokeColor(BRAND)
      .lineWidth(2)
      .stroke();

    // ====== FRÅN / TILL ======
    let y = dividerY + 18;
    const colW = CONTENT_W / 2;

    doc.font(FONT_BOLD).fontSize(9).fillColor(BRAND).text("FRÅN", MARGIN, y);
    doc.font(FONT_BOLD).fontSize(9).fillColor(BRAND).text("TILL", MARGIN + colW, y);
    y += 14;

    const fromLines = [
      ["Triad Solutions", true],
      ["Organisationsnummer: XXXXXX-XXXX", false],
      ["[Gatuadress]", false],
      ["[Postnr] [Ort]", false],
      ["info@triadsolutions.se", false],
      ["[Telefonnummer]", false],
    ] as const;

    const toLines = [
      [offer.customer?.name ?? "—", true],
      [offer.customer?.contact_person ? `Att: ${offer.customer.contact_person}` : "—", false],
      [offer.customer?.email ?? "", false],
      [offer.customer?.phone ?? "", false],
      [offer.customer?.website ?? "", false],
      ["", false],
    ] as const;

    const fromTopY = y;
    let fromY = y;
    for (const [text, bold] of fromLines) {
      doc
        .font(bold ? FONT_BOLD : FONT)
        .fontSize(bold ? 11 : 10)
        .fillColor(bold ? TEXT : GREY)
        .text(text, MARGIN, fromY, { width: colW - 8 });
      fromY += bold ? 16 : 12;
    }
    let toY = y;
    for (const [text, bold] of toLines) {
      doc
        .font(bold ? FONT_BOLD : FONT)
        .fontSize(bold ? 11 : 10)
        .fillColor(bold ? TEXT : GREY)
        .text(text, MARGIN + colW, toY, { width: colW - 8 });
      toY += bold ? 16 : 12;
    }
    y = Math.max(fromY, toY) + 8;

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
      doc.rect(bx, y, boxW - 4, boxH).fillColor(LIGHT).fill();
      doc
        .font(FONT_BOLD)
        .fontSize(7)
        .fillColor(GREY)
        .text(boxes[i].label, bx + 8, y + 7, { width: boxW - 20 });
      doc
        .font(FONT_BOLD)
        .fontSize(11)
        .fillColor(DARK)
        .text(boxes[i].value, bx + 8, y + 22, { width: boxW - 20 });
    }
    y += boxH + 18;

    // ====== PROJEKTBESKRIVNING ======
    y = drawSectionHeading(doc, "PROJEKTBESKRIVNING", y);
    doc
      .font(FONT)
      .fontSize(10)
      .fillColor(offer.project_description ? TEXT : GREY)
      .text(offer.project_description ?? "—", MARGIN, y, { width: CONTENT_W });
    y = doc.y + 14;

    // ====== SPECIFIKATION ======
    y = drawSectionHeading(doc, "SPECIFIKATION", y);

    // Tabellhuvud
    const cols = [
      { x: MARGIN, w: 260, label: "Beskrivning", align: "left" as const },
      { x: MARGIN + 260, w: 60, label: "Antal", align: "center" as const },
      { x: MARGIN + 320, w: 100, label: `À-pris (${offer.currency})`, align: "right" as const },
      { x: MARGIN + 420, w: CONTENT_W - 420, label: `Belopp (${offer.currency})`, align: "right" as const },
    ];

    const rowH = 22;
    // Header
    doc.rect(MARGIN, y, CONTENT_W, rowH).fillColor(DARK).fill();
    for (const c of cols) {
      doc
        .font(FONT_BOLD)
        .fontSize(9)
        .fillColor("white")
        .text(c.label, c.x + 6, y + 7, { width: c.w - 12, align: c.align });
    }
    y += rowH;

    const drawSpecRow = (
      desc: string,
      qty: number,
      unit: number,
      amount: number,
      bg: string | null,
    ) => {
      if (bg) doc.rect(MARGIN, y, CONTENT_W, rowH).fillColor(bg).fill();
      // Border lines
      doc.lineWidth(0.5).strokeColor("#D5D5DA");
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke();
      doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).stroke();

      doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT)
        .text(desc, cols[0].x + 6, y + 7, { width: cols[0].w - 12 });
      doc.font(FONT).fontSize(10).fillColor(TEXT)
        .text(String(qty), cols[1].x + 6, y + 7, { width: cols[1].w - 12, align: "center" });
      doc.font(FONT).fontSize(10).fillColor(TEXT)
        .text(fmtMoney(unit), cols[2].x + 6, y + 7, { width: cols[2].w - 12, align: "right" });
      doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT)
        .text(fmtMoney(amount), cols[3].x + 6, y + 7, { width: cols[3].w - 12, align: "right" });
      y += rowH;
    };

    drawSpecRow("Projektkostnad (engångsavgift)", 1, projPrice, projPrice, null);
    drawSpecRow("Underhållsavgift (per månad)", 1, monthPrice, monthPrice, LIGHT);
    y += 12;

    // ====== ENGÅNGSKOSTNAD TOTALER ======
    y = drawSubsectionHeading(doc, "ENGÅNGSKOSTNAD (faktureras vid projektstart)", y);

    const drawTotalRow = (
      label: string,
      value: string,
      opts: { highlight?: string; tone?: string; divider?: boolean } = {},
    ) => {
      const rowHt = opts.highlight ? 24 : 18;
      if (opts.highlight) {
        // Markerad row med färg över hela bredden av label+value
        const startX = MARGIN + 220;
        doc.rect(startX, y, CONTENT_W - 220, rowHt).fillColor(opts.highlight).fill();
        doc.font(FONT_BOLD).fontSize(11).fillColor("white")
          .text(label, startX + 8, y + 7, { width: 240, align: "right" });
        doc.font(FONT_BOLD).fontSize(11).fillColor("white")
          .text(value, MARGIN + 460, y + 7, { width: CONTENT_W - 460 - 8, align: "right" });
      } else {
        doc.font(FONT_BOLD).fontSize(10).fillColor(opts.tone ?? TEXT)
          .text(label, MARGIN + 220, y + 5, { width: 240, align: "right" });
        doc.font(FONT).fontSize(10).fillColor(opts.tone ?? TEXT)
          .text(value, MARGIN + 460, y + 5, { width: CONTENT_W - 460 - 8, align: "right" });
        if (opts.divider) {
          doc.lineWidth(0.5).strokeColor("#D5D5DA");
          doc.moveTo(MARGIN + 220, y + rowHt - 1)
             .lineTo(MARGIN + CONTENT_W, y + rowHt - 1).stroke();
        }
      }
      y += rowHt;
    };

    drawTotalRow("Delsumma", fmtMoney(projPrice), { divider: true });
    if (projDiscPct > 0) {
      drawTotalRow(`Rabatt (${projDiscPct} %)`, `−${fmtMoney(projDiscount)}`, {
        divider: true,
        tone: ROSE,
      });
      drawTotalRow("Efter rabatt", fmtMoney(projAfter), { divider: true });
    }
    drawTotalRow(`Moms (${vat} %)`, fmtMoney(projVat), { divider: true });
    drawTotalRow("TOTALT (inkl. moms)", `${fmtMoney(projTotal)} ${offer.currency}`, {
      highlight: DARK,
    });
    y += 12;

    // ====== MÅNADSKOSTNAD TOTALER ======
    y = drawSubsectionHeading(doc, "ÅTERKOMMANDE MÅNADSKOSTNAD (faktureras månadsvis)", y);

    drawTotalRow("Per månad exkl. moms", fmtMoney(monthPrice), { divider: true });
    if (monthDiscPct > 0) {
      drawTotalRow(`Rabatt (${monthDiscPct} %)`, `−${fmtMoney(monthDiscount)}`, {
        divider: true,
        tone: ROSE,
      });
      drawTotalRow("Per månad efter rabatt", fmtMoney(monthAfter), { divider: true });
    }
    drawTotalRow(`Moms (${vat} %)`, fmtMoney(monthVat), { divider: true });
    drawTotalRow("PER MÅNAD (inkl. moms)", `${fmtMoney(monthTotal)} ${offer.currency}`, {
      highlight: BRAND,
    });

    // Årskostnad info-rad
    doc.font(FONT_ITALIC).fontSize(9).fillColor(GREY)
      .text("Årskostnad (inkl. moms)", MARGIN + 220, y + 5, { width: 240, align: "right" });
    doc.font(FONT_ITALIC).fontSize(9).fillColor(GREY)
      .text(`${fmtMoney(monthTotal * 12)} ${offer.currency}`, MARGIN + 460, y + 5, {
        width: CONTENT_W - 460 - 8, align: "right",
      });
    y += 22;

    // ====== ÖVRIGA KOSTNADER (conditional) ======
    if (offer.other_costs && offer.other_costs.trim()) {
      y = maybeNewPage(doc, y, 100);
      y = drawSectionHeading(doc, "ÖVRIGA KOSTNADER", y);
      doc.font(FONT).fontSize(10).fillColor(TEXT)
        .text(offer.other_costs, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 4;
      doc.font(FONT_ITALIC).fontSize(9).fillColor(GREY)
        .text(
          "Ovanstående kostnader är rörliga / villkorade och ingår inte i totalsumman ovan.",
          MARGIN, y, { width: CONTENT_W },
        );
      y = doc.y + 14;
    }

    // ====== VILLKOR ======
    y = maybeNewPage(doc, y, 180);
    y = drawSectionHeading(doc, "VILLKOR", y);

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
      doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT)
        .text(`• ${label}`, MARGIN, y, { width: 110, continued: false });
      doc.font(FONT).fontSize(10).fillColor(TEXT)
        .text(text, MARGIN + 115, y, { width: CONTENT_W - 115 });
      y = doc.y + 4;
    }
    y += 10;

    // ====== GODKÄNNANDE ======
    y = maybeNewPage(doc, y, 160);
    y = drawSectionHeading(doc, "GODKÄNNANDE", y);
    doc.font(FONT).fontSize(10).fillColor(GREY)
      .text(
        "Vänligen returnera signerad offert till info@triadsolutions.se för att bekräfta beställningen.",
        MARGIN, y, { width: CONTENT_W },
      );
    y = doc.y + 30;

    const sigW = (CONTENT_W - 30) / 2;
    drawSignatureBlock(doc, MARGIN, y, sigW, "Underskrift — För Triad Solutions");
    drawSignatureBlock(doc, MARGIN + sigW + 30, y, sigW, "Underskrift — För kunden");

    // Footer (sista sidan)
    doc.font(FONT_ITALIC).fontSize(10).fillColor(BRAND)
      .text("Tack för förtroendet!", MARGIN, PAGE_H - MARGIN - 24, {
        width: CONTENT_W, align: "center",
      });

    doc.end();
  });
}

function drawSectionHeading(doc: PDFKit.PDFDocument, label: string, y: number): number {
  doc.font(FONT_BOLD).fontSize(11).fillColor(DARK).text(label, MARGIN, y);
  const lineY = y + 16;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
    .strokeColor(BRAND).lineWidth(1.5).stroke();
  return lineY + 8;
}

function drawSubsectionHeading(doc: PDFKit.PDFDocument, label: string, y: number): number {
  doc.font(FONT_BOLD).fontSize(10).fillColor(DARK).text(label, MARGIN, y);
  const lineY = y + 14;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
    .strokeColor(DARK).lineWidth(0.5).stroke();
  return lineY + 6;
}

function drawSignatureBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
) {
  // Datumlinje
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(TEXT).lineWidth(0.5).stroke();
  doc.font(FONT).fontSize(8).fillColor(GREY).text("Ort och datum", x, y + 3);
  // Underskriftslinje
  const sigY = y + 40;
  doc.moveTo(x, sigY).lineTo(x + w, sigY).strokeColor(TEXT).lineWidth(0.5).stroke();
  doc.font(FONT).fontSize(8).fillColor(GREY).text(label, x, sigY + 3);
  doc.font(FONT).fontSize(8).fillColor(GREY).text("[Namnförtydligande]", x, sigY + 14);
}

function maybeNewPage(doc: PDFKit.PDFDocument, y: number, requiredSpace: number): number {
  if (y + requiredSpace > PAGE_H - MARGIN - 30) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

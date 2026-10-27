// Faktura-PDF med pdf-lib — samma grafiska språk som offerten (offer-pdf.ts):
// logga + titel, FRÅN/TILL, detaljboxar, radtabell, summering och en tydlig
// betalningsruta med bankgiro och OCR-nummer. Sidfoten med de uppgifter en
// svensk faktura ska bära (org.nr, momsreg.nr, säte, F-skatt, bankgiro) ritas
// på varje sida när innehållet är klart, så att "Sida X av Y" blir rätt.

import { PDFDocument, type PDFFont, type PDFImage, StandardFonts } from "pdf-lib";
import {
  A4_W,
  A4_H,
  MARGIN,
  CONTENT_W,
  BRAND,
  DARK,
  LIGHT,
  GREY,
  WHITE,
  BLACK,
  BORDER,
  AMBER,
  Pdf,
  loadLogo,
  drawSectionHeading,
} from "./offer-pdf";
import { type CompanyInfo, companyFromLines } from "./company";
import {
  type InvoiceLine,
  type InvoiceSettings,
  DEFAULT_LATE_INTEREST,
  computeInvoiceTotals,
  fmtAmount,
  fmtQuantity,
  formatBankgiro,
  lineAmount,
  periodLabel,
} from "./invoice";

export type InvoicePdfData = {
  number: string;
  ocr: string | null;
  isDraft: boolean;
  isCredit: boolean;
  creditedNumber: string | null;
  issuedAt: string | null;
  dueDate: string | null;
  paymentTermsDays: number;
  periodStart: string | null;
  periodEnd: string | null;
  reference: string | null;
  ourReference: string | null;
  customer: { name: string; orgNumber: string | null; address: string | null };
  lines: InvoiceLine[];
  vatRate: number;
  currency: string;
  message: string | null;
  offerNumber: string | null;
  agreementNumber: string | null;
};

const FOOTER_H = 58;
const BOTTOM = A4_H - MARGIN - FOOTER_H - 10; // innehållet får inte gå under denna y
const TOTAL_ROW_H = 18;
const TOTAL_BAR_H = 30;
const PAYMENT_BOX_H = 96;
const CREDIT_BOX_H = 46;

export async function generateInvoicePdf(
  inv: InvoicePdfData,
  company: CompanyInfo,
  settings: InvoiceSettings,
): Promise<Uint8Array> {
  const title = inv.isCredit ? "Kreditfaktura" : "Faktura";
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${inv.number}`);
  doc.setAuthor(company.name);
  doc.setCreator(company.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const p = new Pdf(doc, doc.addPage([A4_W, A4_H]), font, fontBold, fontItalic);
  const logo = await loadLogo(doc);

  const totals = computeInvoiceTotals(inv.lines, inv.vatRate, inv.currency);

  // Ny sida med en liten fortsättningsrubrik om `needed` inte ryms.
  const ensure = (needed: number): boolean => {
    if (p.cursor + needed <= BOTTOM) return false;
    p.newPage();
    p.drawText(`${title} ${inv.number} (forts.)`, MARGIN, p.cursor, {
      font: fontBold, size: 9, color: GREY,
    });
    p.cursor += 22;
    return true;
  };

  drawHeader(p, inv, title, logo, company);
  drawParties(p, inv, company);
  drawDetailBoxes(p, inv);

  // ====== AVSER + FAKTURATEXT ======
  const refs = [
    inv.agreementNumber ? `Avtal ${inv.agreementNumber}` : "",
    inv.offerNumber ? `Offert ${inv.offerNumber}` : "",
  ].filter(Boolean);
  if (refs.length > 0) {
    p.drawText(`Avser: ${refs.join(" · ")}`, MARGIN, p.cursor, { size: 9, color: GREY });
    p.cursor += 16;
  }
  if (inv.message?.trim()) {
    const lines = p.wrap(inv.message.trim(), font, 10, CONTENT_W);
    for (const line of lines) {
      ensure(14);
      p.drawText(line, MARGIN, p.cursor, { size: 10, color: BLACK });
      p.cursor += 13.5;
    }
    p.cursor += 8;
  }

  // ====== RADER ======
  ensure(16 + 24 + 20 + 40);
  p.cursor = drawSectionHeading(p, "SPECIFIKATION", p.cursor);
  drawLinesTable(p, inv, ensure);

  // ====== SUMMERING + BETALNING ======
  // Hålls ihop på samma sida så att "Att betala" och betalningsuppgifterna
  // alltid syns tillsammans.
  p.cursor += 10;
  ensure(totalsHeight(totals) + (inv.isCredit ? CREDIT_BOX_H : PAYMENT_BOX_H));
  drawTotals(p, inv, totals);
  if (inv.isCredit) drawCreditBox(p, inv);
  else drawPaymentBox(p, inv, totals.toPay, settings);

  drawFooters(doc, p, company, settings);
  return await doc.save();
}

function drawHeader(p: Pdf, inv: InvoicePdfData, title: string, logo: PDFImage | null, company: CompanyInfo) {
  if (logo) {
    p.drawImage(logo, MARGIN, MARGIN, 70, 70);
  } else {
    p.drawText(company.name.toUpperCase(), MARGIN, MARGIN + 22, {
      font: p.fontBold, size: 20, color: BRAND,
    });
  }
  p.drawText(title.toUpperCase(), MARGIN, MARGIN + 8, {
    font: p.fontBold, size: inv.isCredit ? 24 : 28, color: DARK,
    width: CONTENT_W, align: "right",
  });
  p.drawText(`Nr ${inv.number}`, MARGIN, MARGIN + 42, {
    font: p.fontBold, size: 10, color: BRAND, width: CONTENT_W, align: "right",
  });
  if (inv.isDraft) {
    p.drawText("UTKAST — ej skickad", MARGIN, MARGIN + 57, {
      font: p.fontBold, size: 8, color: AMBER, width: CONTENT_W, align: "right",
    });
  }
  const dividerY = MARGIN + 78;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, dividerY, BRAND, 2);
  p.cursor = dividerY + 16;
}

// Adressen delas på radbrytningar, och en enradsadress "Gata 1, 553 20 Ort"
// delas på kommatecknen — så som adressen står på ett kuvert.
function addressLines(address: string | null | undefined): string[] {
  const raw = (address ?? "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return raw.split(/\s*,\s*/).filter(Boolean);
}

function drawParties(p: Pdf, inv: InvoicePdfData, company: CompanyInfo) {
  const colW = CONTENT_W / 2;
  p.drawText("FRÅN", MARGIN, p.cursor, { font: p.fontBold, size: 9, color: BRAND });
  p.drawText("FAKTURAMOTTAGARE", MARGIN + colW, p.cursor, { font: p.fontBold, size: 9, color: BRAND });
  const top = p.cursor + 14;

  const column = (x: number, rows: [string, boolean][]): number => {
    let y = top;
    for (const [text, bold] of rows) {
      if (!text) continue;
      const size = bold ? 11 : 10;
      for (const line of p.wrap(text, bold ? p.fontBold : p.font, size, colW - 12)) {
        p.drawText(line, x, y, {
          font: bold ? p.fontBold : p.font, size, color: bold ? BLACK : GREY,
        });
        y += bold ? 16 : 13;
      }
    }
    return y;
  };

  const fromY = column(MARGIN, [
    [company.name, true],
    ...companyFromLines(company).map((l) => [l, false] as [string, boolean]),
  ]);
  const toY = column(MARGIN + colW, [
    [inv.customer.name || "—", true],
    [inv.reference ? `Att: ${inv.reference}` : "", false],
    ...addressLines(inv.customer.address).map((l) => [l, false] as [string, boolean]),
    [inv.customer.orgNumber ? `Org.nr: ${inv.customer.orgNumber}` : "", false],
  ]);
  p.cursor = Math.max(fromY, toY) + 8;
}

// Krymp texten tills den ryms (ner till 7 pt).
function fitSize(text: string, font: PDFFont, size: number, maxW: number): number {
  let s = size;
  while (s > 7 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  return s;
}

function drawDetailBoxes(p: Pdf, inv: InvoicePdfData) {
  const period = periodLabel(inv.periodStart, inv.periodEnd);
  const periodBox = period
    ? [{ label: inv.periodStart && inv.periodEnd && inv.periodStart !== inv.periodEnd ? "LEVERANSPERIOD" : "LEVERANSDATUM", value: period }]
    : [];
  const rows = inv.isCredit
    ? [
        [
          { label: "FAKTURANUMMER", value: inv.number },
          { label: "FAKTURADATUM", value: inv.issuedAt ?? "—" },
          { label: "KREDITERAR FAKTURA", value: inv.creditedNumber ?? "—" },
          { label: "ER REFERENS", value: inv.reference || "—" },
        ],
        [{ label: "VÅR REFERENS", value: inv.ourReference || "—" }, ...periodBox],
      ]
    : [
        [
          { label: "FAKTURANUMMER", value: inv.number },
          { label: "FAKTURADATUM", value: inv.issuedAt ?? "—" },
          { label: "FÖRFALLODATUM", value: inv.dueDate ?? "—" },
          { label: "OCR-NUMMER", value: inv.ocr ?? "—" },
        ],
        [
          { label: "ER REFERENS", value: inv.reference || "—" },
          { label: "VÅR REFERENS", value: inv.ourReference || "—" },
          { label: "BETALNINGSVILLKOR", value: `${inv.paymentTermsDays} dagar netto` },
          ...periodBox,
        ],
      ];
  const boxW = CONTENT_W / 4;
  for (const [r, boxes] of rows.entries()) {
    const boxH = r === 0 ? 46 : 40;
    const valueSize = r === 0 ? 11 : 10;
    for (const [i, box] of boxes.entries()) {
      const bx = MARGIN + i * boxW;
      p.drawRect(bx, p.cursor, boxW - 4, boxH, LIGHT);
      p.drawText(box.label, bx + 8, p.cursor + 8, { font: p.fontBold, size: 7, color: GREY });
      const size = fitSize(box.value, p.fontBold, valueSize, boxW - 16);
      p.drawText(box.value, bx + 8, p.cursor + (r === 0 ? 22 : 20), {
        font: p.fontBold, size, color: DARK,
      });
    }
    p.cursor += boxH + 4;
  }
  p.cursor += 12;
}

function drawLinesTable(p: Pdf, inv: InvoicePdfData, ensure: (needed: number) => boolean) {
  const x = MARGIN;
  const w = CONTENT_W;
  const padX = 8;
  const showDisc = inv.lines.some((l) => l.discount_pct > 0);
  // Högerkanter (relativt tabellen) för de högerjusterade kolumnerna.
  const c = showDisc
    ? { descEnd: w * 0.47, qtyEnd: w * 0.56, unitX: w * 0.58, priceEnd: w * 0.75, discEnd: w * 0.84 }
    : { descEnd: w * 0.53, qtyEnd: w * 0.62, unitX: w * 0.64, priceEnd: w * 0.82, discEnd: 0 };
  const amtEnd = w - padX;
  const descW = c.descEnd - padX - 6;

  const header = () => {
    p.drawRect(x, p.cursor, w, 18, LIGHT, { color: BORDER, width: 0.5 });
    const y = p.cursor + 5;
    const opts = { font: p.fontBold, size: 8, color: GREY };
    p.drawText("Beskrivning", x + padX, y, opts);
    p.drawText("Antal", x, y, { ...opts, width: c.qtyEnd, align: "right" });
    p.drawText("Enhet", x + c.unitX, y, opts);
    p.drawText("À-pris", x, y, { ...opts, width: c.priceEnd, align: "right" });
    if (showDisc) p.drawText("Rabatt", x, y, { ...opts, width: c.discEnd, align: "right" });
    p.drawText("Belopp", x, y, { ...opts, width: amtEnd, align: "right" });
    p.cursor += 18;
  };

  header();
  if (inv.lines.length === 0) {
    p.drawRect(x, p.cursor, w, 22, WHITE, { color: BORDER, width: 0.3 });
    p.drawText("Inga rader", x + padX, p.cursor + 7, { font: p.fontItalic, size: 9, color: GREY });
    p.cursor += 22;
    return;
  }

  for (const line of inv.lines) {
    const desc = p.wrap(line.description.trim() || "—", p.font, 9, descW);
    const rowH = Math.max(22, desc.length * 11 + 11);
    if (ensure(rowH)) header();
    const y = p.cursor;
    p.drawRect(x, y, w, rowH, WHITE, { color: BORDER, width: 0.3 });
    desc.forEach((d, i) => p.drawText(d, x + padX, y + 7 + i * 11, { size: 9, color: BLACK }));
    const ty = y + 7;
    p.drawText(fmtQuantity(line.quantity), x, ty, { size: 9, color: BLACK, width: c.qtyEnd, align: "right" });
    p.drawText(line.unit || "", x + c.unitX, ty, { size: 9, color: GREY });
    p.drawText(fmtAmount(line.unit_price), x, ty, { size: 9, color: BLACK, width: c.priceEnd, align: "right" });
    if (showDisc) {
      p.drawText(line.discount_pct > 0 ? `${fmtQuantity(line.discount_pct)} %` : "—", x, ty, {
        size: 9, color: GREY, width: c.discEnd, align: "right",
      });
    }
    p.drawText(fmtAmount(lineAmount(line)), x, ty, {
      font: p.fontBold, size: 9, color: BLACK, width: amtEnd, align: "right",
    });
    p.cursor += rowH;
  }
}

type Totals = ReturnType<typeof computeInvoiceTotals>;

function totalsRows(inv: Pick<InvoicePdfData, "vatRate">, t: Totals): [string, string][] {
  const rows: [string, string][] = [
    ["Netto exkl. moms", fmtAmount(t.net)],
    [`Moms ${fmtQuantity(inv.vatRate)} %`, fmtAmount(t.vat)],
  ];
  if (t.rounding !== 0) rows.push(["Öresavrundning", fmtAmount(t.rounding)]);
  return rows;
}

// Höjden drawTotals tar, inkl. luft under total-raden.
function totalsHeight(t: Totals): number {
  return (t.rounding !== 0 ? 3 : 2) * TOTAL_ROW_H + 4 + TOTAL_BAR_H + 18;
}

function drawTotals(p: Pdf, inv: InvoicePdfData, t: Totals) {
  const rows = totalsRows(inv, t);
  const rowH = TOTAL_ROW_H;
  const barH = TOTAL_BAR_H;
  const w = 250;
  const x = MARGIN + CONTENT_W - w;
  for (const [label, value] of rows) {
    p.drawText(label, x + 10, p.cursor + 5, { size: 9, color: GREY });
    p.drawText(value, x, p.cursor + 5, { size: 9, color: BLACK, width: w - 10, align: "right" });
    p.drawLine(x, x + w, p.cursor + rowH, BORDER, 0.5);
    p.cursor += rowH;
  }
  p.cursor += 4;
  p.drawRect(x, p.cursor, w, barH, inv.isCredit ? DARK : BRAND);
  p.drawText(inv.isCredit ? "KREDITERAT BELOPP" : "ATT BETALA", x + 10, p.cursor + 11, {
    font: p.fontBold, size: 9, color: WHITE,
  });
  p.drawText(`${fmtAmount(t.toPay)} ${inv.currency}`, x, p.cursor + 8, {
    font: p.fontBold, size: 14, color: WHITE, width: w - 10, align: "right",
  });
  p.cursor += barH + 18;
}

function drawPaymentBox(p: Pdf, inv: InvoicePdfData, toPay: number, settings: InvoiceSettings) {
  const h = PAYMENT_BOX_H;
  const x = MARGIN;
  const y = p.cursor;
  p.drawRect(x, y, CONTENT_W, h, LIGHT, { color: BORDER, width: 0.5 });
  p.drawRect(x, y, 3, h, BRAND);
  p.drawText("BETALNINGSINFORMATION", x + 14, y + 11, { font: p.fontBold, size: 9, color: BRAND });

  const cols = [
    { label: "BANKGIRO", value: formatBankgiro(settings.bankgiro) || "—" },
    { label: "OCR-NUMMER", value: inv.ocr ?? "—" },
    { label: "FÖRFALLODATUM", value: inv.dueDate ?? "—" },
    { label: "ATT BETALA", value: `${fmtAmount(toPay)} ${inv.currency}` },
  ];
  const colW = (CONTENT_W - 28) / 4;
  cols.forEach((col, i) => {
    const cx = x + 14 + i * colW;
    p.drawText(col.label, cx, y + 30, { font: p.fontBold, size: 7, color: GREY });
    const size = fitSize(col.value, p.fontBold, 13, colW - 8);
    p.drawText(col.value, cx, y + 42, { font: p.fontBold, size, color: DARK });
  });

  p.drawText(
    "Ange OCR-numret som referens när du betalar, så kopplas betalningen till rätt faktura.",
    x + 14, y + 66, { size: 8, color: GREY, width: CONTENT_W - 28 },
  );
  p.drawText(settings.lateInterest || DEFAULT_LATE_INTEREST, x + 14, y + 78, {
    font: p.fontItalic, size: 8, color: GREY, width: CONTENT_W - 28,
  });
  p.cursor = y + h + 12;
}

function drawCreditBox(p: Pdf, inv: InvoicePdfData) {
  const h = CREDIT_BOX_H;
  const x = MARGIN;
  const y = p.cursor;
  p.drawRect(x, y, CONTENT_W, h, LIGHT, { color: BORDER, width: 0.5 });
  p.drawRect(x, y, 3, h, DARK);
  p.drawText("KREDITERING", x + 14, y + 11, { font: p.fontBold, size: 9, color: DARK });
  p.drawText(
    `Kreditfakturan avser faktura ${inv.creditedNumber ?? "—"} och regleras mot den. Ingen betalning ska göras.`,
    x + 14, y + 28, { size: 9, color: BLACK, width: CONTENT_W - 28 },
  );
  p.cursor = y + h + 12;
}

function drawFooters(doc: PDFDocument, p: Pdf, company: CompanyInfo, settings: InvoiceSettings) {
  const pages = doc.getPages();
  const colW = CONTENT_W / 4;
  const top = A4_H - MARGIN - FOOTER_H + 8;
  const columns: { text: string; bold?: boolean }[][] = [
    [
      { text: company.name, bold: true },
      ...(company.address || "").split(/\r?\n/).filter((l) => l.trim()).map((l) => ({ text: l.trim() })),
    ],
    [
      { text: "Kontakt", bold: true },
      ...(company.phone ? [{ text: company.phone }] : []),
      ...(company.email ? [{ text: company.email }] : []),
    ],
    [
      { text: "Företagsuppgifter", bold: true },
      { text: `Org.nr ${company.orgNumber || "—"}` },
      { text: `Momsreg.nr ${settings.vatNumber || "—"}` },
      ...(settings.registeredOffice ? [{ text: `Styrelsens säte: ${settings.registeredOffice}` }] : []),
      ...(settings.fSkatt ? [{ text: "Godkänd för F-skatt" }] : []),
    ],
    [
      { text: "Betalning", bold: true },
      { text: `Bankgiro ${formatBankgiro(settings.bankgiro) || "—"}` },
    ],
  ];

  pages.forEach((page, idx) => {
    p.page = page;
    p.drawLine(MARGIN, MARGIN + CONTENT_W, top - 8, BORDER, 0.5);
    columns.forEach((col, i) => {
      col.slice(0, 5).forEach((row, r) => {
        p.drawText(row.text, MARGIN + i * colW, top + r * 9.5, {
          font: row.bold ? p.fontBold : p.font, size: 7, color: row.bold ? DARK : GREY,
        });
      });
    });
    p.drawText(`Sida ${idx + 1} av ${pages.length}`, MARGIN, A4_H - MARGIN - 6, {
      size: 7, color: GREY, width: CONTENT_W, align: "right",
    });
  });
}

// Genererar en branded Excel-offert med live-formler.
// Tar emot offer + customer-data och returnerar en Buffer redo att skickas
// som attachment.

import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";

const BRAND = "FF00B4A8";
const DARK = "FF0A2540";
const LIGHT = "FFF5F5F7";
const GREY = "FF636366";
const WHITE = "FFFFFFFF";
const BORDER_GREY = "FFD5D5DA";

const FONT = "Calibri";

const fNormal = { name: FONT, size: 10, color: { argb: "FF000000" } };
const fGrey = { name: FONT, size: 10, color: { argb: GREY } };
const fSmall = { name: FONT, size: 8, color: { argb: GREY }, bold: true };
const fHeading = { name: FONT, size: 11, color: { argb: DARK }, bold: true };
const fBrand = { name: FONT, size: 9, color: { argb: BRAND }, bold: true };

const thin = { style: "thin" as const, color: { argb: BORDER_GREY } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

export type OfferData = {
  offer_number: string | null;
  title: string | null;
  reference: string | null;
  offer_date: string;
  valid_until: string | null;
  project_description: string | null;
  project_price: number;
  monthly_price: number;
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

export async function generateOfferXlsx(offer: OfferData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Triad Solutions";
  wb.title = `Offert ${offer.offer_number ?? ""}`.trim();

  const ws = wb.addWorksheet("Offert", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false, showRowColHeaders: true }],
    properties: { defaultRowHeight: 16 },
  });

  ws.columns = [
    { width: 2 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 2 },
  ];

  function set(addr: string, value: any, opts: any = {}) {
    const c = ws.getCell(addr);
    c.value = value;
    if (opts.font) c.font = opts.font;
    if (opts.alignment) c.alignment = opts.alignment;
    if (opts.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    if (opts.border) c.border = opts.border;
    if (opts.numFmt) c.numFmt = opts.numFmt;
    return c;
  }

  function setMerge(range: string, value: any, opts: any = {}) {
    ws.mergeCells(range);
    const startAddr = range.split(":")[0];
    set(startAddr, value, opts);
    if (opts.fill || opts.border) {
      const [start, end] = range.split(":");
      const startRow = parseInt(start.match(/\d+/)![0], 10);
      const endRow = parseInt(end.match(/\d+/)![0], 10);
      const startCol = start.match(/[A-Z]+/)![0].charCodeAt(0);
      const endCol = end.match(/[A-Z]+/)![0].charCodeAt(0);
      for (let r = startRow; r <= endRow; r++) {
        for (let cc = startCol; cc <= endCol; cc++) {
          const cell = ws.getCell(`${String.fromCharCode(cc)}${r}`);
          if (opts.fill)
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
          if (opts.border) cell.border = opts.border;
        }
      }
    }
  }

  const setRowHeight = (row: number, h: number) => {
    ws.getRow(row).height = h;
  };
  const sectionUnderline = (row: number, color = BRAND, weight: "thin" | "medium" = "medium") => {
    for (const col of ["B", "C", "D", "E", "F"]) {
      const cell = ws.getCell(`${col}${row}`);
      cell.border = {
        ...(cell.border || {}),
        bottom: { style: weight, color: { argb: color } },
      };
    }
  };

  // ========================================
  // HEADER
  // ========================================
  setRowHeight(1, 40);
  setRowHeight(2, 22);
  setRowHeight(3, 10);

  setMerge("E1:F1", "OFFERT", {
    font: { name: FONT, size: 26, bold: true, color: { argb: DARK } },
    alignment: { vertical: "middle", horizontal: "right" },
  });
  setMerge("E2:F2", "Skräddarsydd mjukvara för SMB", {
    font: { name: FONT, size: 9, color: { argb: BRAND }, italic: true },
    alignment: { vertical: "middle", horizontal: "right" },
  });

  // Försök läsa logo från admin/public/logos/
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logos", "Logo_Color_with_text.png");
    const buf = await fs.readFile(logoPath);
    // exceljs addImage expects an older Buffer typing; cast to satisfy TS.
    const logoId = wb.addImage({ buffer: buf as unknown as ArrayBuffer, extension: "png" });
    ws.addImage(logoId, { tl: { col: 1, row: 0 }, ext: { width: 200, height: 70 } });
  } catch {
    // Fallback text om logo saknas
    setMerge("B1:D2", "TRIAD SOLUTIONS", {
      font: { name: FONT, size: 22, bold: true, color: { argb: BRAND } },
      alignment: { vertical: "middle", horizontal: "left" },
    });
  }

  setRowHeight(4, 6);
  for (const col of ["B", "C", "D", "E", "F"]) {
    ws.getCell(`${col}4`).border = { bottom: { style: "medium", color: { argb: BRAND } } };
  }
  setRowHeight(5, 12);

  // ========================================
  // FRÅN / TILL
  // ========================================
  set("B6", "FRÅN", { font: fBrand });
  set("E6", "TILL", { font: fBrand });
  setRowHeight(6, 16);

  setMerge("B7:D7", "Triad Solutions", { font: { name: FONT, size: 11, bold: true } });
  setMerge("E7:F7", offer.customer?.name ?? "—", { font: { name: FONT, size: 11, bold: true } });

  setMerge("B8:D8", "Organisationsnummer: XXXXXX-XXXX", { font: fGrey });
  setMerge("E8:F8", offer.customer?.contact_person ? `Att: ${offer.customer.contact_person}` : "—", { font: fGrey });

  setMerge("B9:D9", "[Gatuadress]", { font: fGrey });
  setMerge("E9:F9", offer.customer?.email ?? "", { font: fGrey });

  setMerge("B10:D10", "[Postnr] [Ort]", { font: fGrey });
  setMerge("E10:F10", offer.customer?.phone ?? "", { font: fGrey });

  setMerge("B11:D11", "info@triadsolutions.se", { font: fGrey });
  setMerge("E11:F11", offer.customer?.website ?? "", { font: fGrey });

  setMerge("B12:D12", "[Telefonnummer]", { font: fGrey });
  setMerge("E12:F12", "", { font: fGrey });

  setRowHeight(13, 14);

  // ========================================
  // OFFERTDETALJER
  // ========================================
  setRowHeight(14, 16);
  setRowHeight(15, 22);

  const detailBoxes = [
    { col: "B", label: "OFFERTNUMMER", value: offer.offer_number ?? "—" },
    { col: "C:D", label: "OFFERTDATUM", value: fmtDateSv(offer.offer_date) },
    { col: "E", label: "GILTIG TILL", value: fmtDateSv(offer.valid_until) },
    { col: "F", label: "ER REFERENS", value: offer.reference ?? "—" },
  ];

  for (const b of detailBoxes) {
    const [c1, c2] = b.col.includes(":") ? b.col.split(":") : [b.col, b.col];
    setMerge(`${c1}14:${c2}14`, b.label, {
      font: { name: FONT, size: 8, bold: true, color: { argb: GREY } },
      alignment: { vertical: "middle", horizontal: "left", indent: 1 },
      fill: LIGHT,
    });
    setMerge(`${c1}15:${c2}15`, b.value, {
      font: { name: FONT, size: 11, bold: true, color: { argb: DARK } },
      alignment: { vertical: "middle", horizontal: "left", indent: 1 },
      fill: LIGHT,
    });
  }

  setRowHeight(16, 16);

  // ========================================
  // PROJEKTBESKRIVNING
  // ========================================
  const PB = 17;
  set(`B${PB}`, "PROJEKTBESKRIVNING", { font: fHeading });
  sectionUnderline(PB);
  setRowHeight(PB, 22);

  setMerge(
    `B${PB + 1}:F${PB + 3}`,
    offer.project_description ?? "—",
    {
      font: offer.project_description ? fNormal : fGrey,
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
    },
  );
  setRowHeight(PB + 1, 18);
  setRowHeight(PB + 2, 18);
  setRowHeight(PB + 3, 18);
  setRowHeight(PB + 4, 14);

  // ========================================
  // SPECIFIKATION
  // ========================================
  const SP = PB + 5;
  set(`B${SP}`, "SPECIFIKATION", { font: fHeading });
  sectionUnderline(SP);
  setRowHeight(SP, 22);
  setRowHeight(SP + 1, 8);

  const HDR = SP + 2;
  const headerCellOpts = {
    font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
    fill: DARK,
    border: allBorders,
  };
  setMerge(`B${HDR}:B${HDR}`, "Beskrivning", {
    ...headerCellOpts,
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  set(`C${HDR}`, "Antal", {
    ...headerCellOpts,
    alignment: { vertical: "middle", horizontal: "center" },
  });
  set(`D${HDR}`, `À-pris (${offer.currency})`, {
    ...headerCellOpts,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  setMerge(`E${HDR}:F${HDR}`, `Belopp (${offer.currency})`, {
    ...headerCellOpts,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  setRowHeight(HDR, 24);

  const numFmt = "#,##0.00";

  // Rad 1: Engångskostnad
  const R1 = HDR + 1;
  set(`B${R1}`, "Projektkostnad (engångsavgift)", {
    font: { ...fNormal, bold: true },
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
  });
  set(`C${R1}`, 1, {
    font: fNormal,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "center" },
    numFmt: "0",
  });
  set(`D${R1}`, offer.project_price, {
    font: fNormal,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
    numFmt,
  });
  setMerge(`E${R1}:F${R1}`, { formula: `C${R1}*D${R1}` }, {
    font: { ...fNormal, bold: true },
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  ws.getCell(`E${R1}`).numFmt = numFmt;
  setRowHeight(R1, 24);

  // Rad 2: Underhållsavgift
  const R2 = HDR + 2;
  set(`B${R2}`, "Underhållsavgift (per månad)", {
    font: { ...fNormal, bold: true },
    fill: LIGHT,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
  });
  set(`C${R2}`, 1, {
    font: fNormal,
    fill: LIGHT,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "center" },
    numFmt: "0",
  });
  set(`D${R2}`, offer.monthly_price, {
    font: fNormal,
    fill: LIGHT,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
    numFmt,
  });
  setMerge(`E${R2}:F${R2}`, { formula: `C${R2}*D${R2}` }, {
    font: { ...fNormal, bold: true },
    fill: LIGHT,
    border: allBorders,
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  ws.getCell(`E${R2}`).numFmt = numFmt;
  setRowHeight(R2, 24);

  setRowHeight(R2 + 1, 14);

  function totalsRow(row: number, labelText: string, formula: string, opts: any = {}) {
    const labelFont = opts.highlight
      ? { name: FONT, size: 11, bold: true, color: { argb: WHITE } }
      : { name: FONT, size: 10, bold: true };
    const valueFont = opts.highlight
      ? { name: FONT, size: 11, bold: true, color: { argb: WHITE } }
      : fNormal;
    const fill = opts.highlight ? opts.highlight : null;
    const border = opts.divider ? { bottom: thin } : undefined;

    setMerge(`C${row}:D${row}`, labelText, {
      font: labelFont,
      alignment: { vertical: "middle", horizontal: "right", indent: 1 },
      fill,
      border,
    });
    setMerge(`E${row}:F${row}`, { formula }, {
      font: valueFont,
      alignment: { vertical: "middle", horizontal: "right", indent: 1 },
      fill,
      border,
    });
    ws.getCell(`E${row}`).numFmt = numFmt;
    setRowHeight(row, opts.highlight ? 26 : 20);
  }

  // ENGÅNGSKOSTNAD
  const ETO = R2 + 2;
  setMerge(`B${ETO}:F${ETO}`, "ENGÅNGSKOSTNAD (faktureras vid projektstart)", {
    font: { name: FONT, size: 10, bold: true, color: { argb: DARK } },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  sectionUnderline(ETO, "FF0A2540", "thin");
  setRowHeight(ETO, 22);

  const vatPct = (offer.vat_rate ?? 25) / 100;
  const ED = ETO + 1;
  const EM = ETO + 2;
  const ET = ETO + 3;
  totalsRow(ED, "Delsumma", `E${R1}`, { divider: true });
  totalsRow(EM, `Moms (${offer.vat_rate ?? 25} %)`, `E${ED}*${vatPct}`, { divider: true });
  totalsRow(ET, "TOTALT (inkl. moms)", `E${ED}+E${EM}`, { highlight: DARK });

  setRowHeight(ET + 1, 14);

  // MÅNADSKOSTNAD
  const MTO = ET + 2;
  setMerge(`B${MTO}:F${MTO}`, "ÅTERKOMMANDE MÅNADSKOSTNAD (faktureras månadsvis)", {
    font: { name: FONT, size: 10, bold: true, color: { argb: DARK } },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  sectionUnderline(MTO, "FF0A2540", "thin");
  setRowHeight(MTO, 22);

  const MD = MTO + 1;
  const MM = MTO + 2;
  const MT = MTO + 3;
  const MY = MTO + 4;
  totalsRow(MD, "Per månad exkl. moms", `E${R2}`, { divider: true });
  totalsRow(MM, `Moms (${offer.vat_rate ?? 25} %)`, `E${MD}*${vatPct}`, { divider: true });
  totalsRow(MT, "PER MÅNAD (inkl. moms)", `E${MD}+E${MM}`, { highlight: BRAND });

  setMerge(`C${MY}:D${MY}`, "Årskostnad (inkl. moms)", {
    font: { ...fGrey, italic: true },
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  setMerge(`E${MY}:F${MY}`, { formula: `E${MT}*12` }, {
    font: { ...fGrey, italic: true },
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  ws.getCell(`E${MY}`).numFmt = numFmt;
  setRowHeight(MY, 18);

  setRowHeight(MY + 1, 14);

  // ========================================
  // VILLKOR
  // ========================================
  const V = MY + 2;
  set(`B${V}`, "VILLKOR", { font: fHeading });
  sectionUnderline(V);
  setRowHeight(V, 22);

  const validUntilStr = fmtDateSv(offer.valid_until);

  const villkor: [string, string][] = [
    ["Betalningsvillkor:", "30 dagar netto från fakturadatum."],
    ["Giltighetstid:", `Offerten är giltig till ${validUntilStr}.`],
    ["Leveranstid:", "[Ange uppskattad leveranstid eller projektplan]."],
    ["Priser:", `Samtliga priser anges exklusive moms i ${offer.currency}.`],
    ["Ändringar:", "Tilläggsarbeten utöver specifikationen debiteras separat enligt timpris [XXX SEK/h]."],
    ["Underhåll:", "Avtalstid 12 mån, därefter löpande med 3 mån uppsägningstid om inget annat avtalats."],
    ["Resor/utlägg:", "Eventuella resor och utlägg debiteras enligt självkostnadsprincipen."],
    ["Övrigt:", "I övrigt gäller ALOS 05 (Allmänna leveransbestämmelser)."],
  ];
  villkor.forEach((row, idx) => {
    const r = V + 1 + idx;
    setRowHeight(r, 18);
    set(`B${r}`, "•  " + row[0], {
      font: { name: FONT, size: 10, bold: true },
      alignment: { vertical: "middle", horizontal: "left" },
    });
    setMerge(`C${r}:F${r}`, row[1], {
      font: fNormal,
      alignment: { vertical: "middle", horizontal: "left", wrapText: true },
    });
  });

  const SIG = V + 1 + villkor.length + 1;
  setRowHeight(SIG - 1, 14);

  // ========================================
  // GODKÄNNANDE / SIGNATUR
  // ========================================
  set(`B${SIG}`, "GODKÄNNANDE", { font: fHeading });
  sectionUnderline(SIG);
  setRowHeight(SIG, 22);

  setMerge(
    `B${SIG + 1}:F${SIG + 1}`,
    "Vänligen returnera signerad offert till info@triadsolutions.se för att bekräfta beställningen.",
    { font: fGrey, alignment: { vertical: "middle", horizontal: "left" } },
  );
  setRowHeight(SIG + 1, 18);
  setRowHeight(SIG + 2, 36);

  const sigLine = { bottom: { style: "thin" as const, color: { argb: "FF000000" } } };

  ws.mergeCells(`B${SIG + 3}:C${SIG + 3}`);
  ws.getCell(`B${SIG + 3}`).border = sigLine;
  ws.getCell(`C${SIG + 3}`).border = sigLine;
  ws.mergeCells(`E${SIG + 3}:F${SIG + 3}`);
  ws.getCell(`E${SIG + 3}`).border = sigLine;
  ws.getCell(`F${SIG + 3}`).border = sigLine;
  setRowHeight(SIG + 3, 22);

  setRowHeight(SIG + 4, 14);
  setMerge(`B${SIG + 4}:C${SIG + 4}`, "Ort och datum", { font: fSmall });
  setMerge(`E${SIG + 4}:F${SIG + 4}`, "Ort och datum", { font: fSmall });

  setRowHeight(SIG + 5, 36);

  ws.mergeCells(`B${SIG + 6}:C${SIG + 6}`);
  ws.getCell(`B${SIG + 6}`).border = sigLine;
  ws.getCell(`C${SIG + 6}`).border = sigLine;
  ws.mergeCells(`E${SIG + 6}:F${SIG + 6}`);
  ws.getCell(`E${SIG + 6}`).border = sigLine;
  ws.getCell(`F${SIG + 6}`).border = sigLine;
  setRowHeight(SIG + 6, 22);

  setMerge(`B${SIG + 7}:C${SIG + 7}`, "Underskrift — För Triad Solutions", { font: fSmall });
  setMerge(`E${SIG + 7}:F${SIG + 7}`, "Underskrift — För kunden", { font: fSmall });
  setRowHeight(SIG + 7, 14);

  setMerge(`B${SIG + 8}:C${SIG + 8}`, "[Namnförtydligande]", { font: fGrey });
  setMerge(`E${SIG + 8}:F${SIG + 8}`, "[Namnförtydligande]", { font: fGrey });
  setRowHeight(SIG + 8, 14);

  setRowHeight(SIG + 9, 20);
  setMerge(`B${SIG + 10}:F${SIG + 10}`, "Tack för förtroendet!", {
    font: { name: FONT, size: 11, italic: true, color: { argb: BRAND } },
    alignment: { vertical: "middle", horizontal: "center" },
  });
  setRowHeight(SIG + 10, 22);

  ws.pageSetup.printArea = `A1:G${SIG + 10}`;

  // exceljs writeBuffer returns a Node Buffer at runtime; TS types disagree
  // between Node/edge Buffer variants, so cast to a runtime-compatible shape.
  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Uint8Array;
}

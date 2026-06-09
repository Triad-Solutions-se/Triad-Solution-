// Genererar en branded Excel-offert med live-formler.
// Tar emot offer + customer-data och returnerar en Buffer redo att skickas
// som attachment.

import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { type OfferItem, itemsOrFallback } from "./offer-items";

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
  custom_header?: string | null;
  custom_text?: string | null;
  project_price: number;
  monthly_price: number;
  project_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
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
  // Bevarar bildens aspect ratio så den inte sträcks — våra logo-filer är
  // 1080x1080 (ikon + text staplade i samma frame), så target-höjden styr.
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logos", "Logo_Color_with_text.png");
    const buf = await fs.readFile(logoPath);
    const dims = readPngDimensions(buf);
    const targetHeight = 80;
    const width = dims ? Math.round(targetHeight * (dims.width / dims.height)) : targetHeight;
    const logoId = wb.addImage({ buffer: buf as unknown as ArrayBuffer, extension: "png" });
    ws.addImage(logoId, { tl: { col: 1, row: 0 }, ext: { width, height: targetHeight } });
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
  // EXTRA INFORMATION (valfri, per offert)
  // ========================================
  let afterPB = PB + 5;
  const customHeader = offer.custom_header?.trim();
  const customText = offer.custom_text?.trim();
  if (customHeader || customText) {
    const CH = afterPB;
    set(`B${CH}`, customHeader || "EXTRA INFORMATION", { font: fHeading });
    sectionUnderline(CH);
    setRowHeight(CH, 22);

    const lines = customText ? customText.split(/\r?\n/) : [];
    const linesNeeded = Math.max(lines.length, 2);
    const cFirst = CH + 1;
    const cLast = CH + linesNeeded;
    setMerge(`B${cFirst}:F${cLast}`, customText || "—", {
      font: customText ? fNormal : fGrey,
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
    });
    for (let r = cFirst; r <= cLast; r++) setRowHeight(r, 18);
    afterPB = cLast + 1;
    setRowHeight(afterPB, 14);
    afterPB++;
  }

  // ========================================
  // SPECIFIKATION
  // ========================================
  const SP = afterPB;
  set(`B${SP}`, "SPECIFIKATION", { font: fHeading });
  sectionUnderline(SP);
  setRowHeight(SP, 22);
  setRowHeight(SP + 1, 8);

  // Visar heltal i offerten (närmaste krona). Excel-cellen har fortfarande
  // full precision under huven — bara presentationen rundas.
  const numFmt = "#,##0";
  const vatPct = (offer.vat_rate ?? 25) / 100;

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

  // Emit en hel pris-sektion (heading + tabellrubrik + items + totals).
  // Returnerar nästa lediga rad samt raden där sektionens TOTAL ligger, så
  // ev. årskostnad-rad kan referera den med formel.
  function emitSection(opts: {
    startRow: number;
    heading: string;
    items: OfferItem[];
    totalLabel: string;
    highlightColor: string;
  }): { nextRow: number; totalRow: number } {
    let r = opts.startRow;

    // Section-heading
    setMerge(`B${r}:F${r}`, opts.heading, {
      font: { name: FONT, size: 10, bold: true, color: { argb: DARK } },
      alignment: { vertical: "middle", horizontal: "left" },
    });
    sectionUnderline(r, "FF0A2540", "thin");
    setRowHeight(r, 22);
    r++;

    // Tabellrubrik
    const HR = r;
    const headerCellOpts = {
      font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
      fill: DARK,
      border: allBorders,
    };
    setMerge(`B${HR}:B${HR}`, "Beskrivning", {
      ...headerCellOpts,
      alignment: { vertical: "middle", horizontal: "left", indent: 1 },
    });
    set(`C${HR}`, `À-pris (${offer.currency})`, {
      ...headerCellOpts,
      alignment: { vertical: "middle", horizontal: "right", indent: 1 },
    });
    set(`D${HR}`, "Rabatt %", {
      ...headerCellOpts,
      alignment: { vertical: "middle", horizontal: "center" },
    });
    setMerge(`E${HR}:F${HR}`, `Belopp (${offer.currency})`, {
      ...headerCellOpts,
      alignment: { vertical: "middle", horizontal: "right", indent: 1 },
    });
    setRowHeight(HR, 24);
    r++;

    // Items
    const itemsStart = r;
    const hasAnyDiscount = opts.items.some((it) => (it.discount_pct ?? 0) > 0);

    if (opts.items.length === 0) {
      setMerge(`B${r}:F${r}`, "Inga rader.", {
        font: { ...fGrey, italic: true },
        alignment: { vertical: "middle", horizontal: "left", indent: 1 },
        border: allBorders,
      });
      setRowHeight(r, 22);
      r++;
    } else {
      opts.items.forEach((it, idx) => {
        const stripe = idx % 2 === 1 ? LIGHT : null;
        const cellOpts = (extra: any = {}) => ({
          ...extra,
          border: allBorders,
          ...(stripe ? { fill: stripe } : {}),
        });
        set(`B${r}`, it.description || "—", cellOpts({
          font: { ...fNormal, bold: true },
          alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
        }));
        set(`C${r}`, it.unit_price, cellOpts({
          font: fNormal,
          alignment: { vertical: "middle", horizontal: "right", indent: 1 },
          numFmt,
        }));
        set(`D${r}`, it.discount_pct > 0 ? it.discount_pct / 100 : null, cellOpts({
          font: it.discount_pct > 0
            ? { name: FONT, size: 10, color: { argb: "FFB91C1C" } }
            : fGrey,
          alignment: { vertical: "middle", horizontal: "center" },
          numFmt: "0.##%",
        }));
        setMerge(`E${r}:F${r}`, { formula: `C${r}*(1-IFERROR(D${r},0))` }, cellOpts({
          font: { ...fNormal, bold: true },
          alignment: { vertical: "middle", horizontal: "right", indent: 1 },
        }));
        ws.getCell(`E${r}`).numFmt = numFmt;
        setRowHeight(r, 22);
        r++;
      });
    }
    const itemsEnd = r - 1;

    // Totals
    const subRow = r++;
    totalsRow(
      subRow,
      "Delsumma",
      opts.items.length > 0 ? `SUM(C${itemsStart}:C${itemsEnd})` : "0",
      { divider: true },
    );

    let afterDiscRef = `E${subRow}`;
    if (hasAnyDiscount && opts.items.length > 0) {
      const rabRow = r++;
      totalsRow(
        rabRow,
        "Total rabatt",
        `SUM(E${itemsStart}:E${itemsEnd})-SUM(C${itemsStart}:C${itemsEnd})`,
        { divider: true },
      );
      ws.getCell(`E${rabRow}`).font = { name: FONT, size: 10, color: { argb: "FFB91C1C" } };

      const afterRow = r++;
      totalsRow(afterRow, "Efter rabatt", `SUM(E${itemsStart}:E${itemsEnd})`, { divider: true });
      afterDiscRef = `E${afterRow}`;
    }

    const momsRow = r++;
    totalsRow(
      momsRow,
      `Moms (${offer.vat_rate ?? 25} %)`,
      `${afterDiscRef}*${vatPct}`,
      { divider: true },
    );

    const totalRow = r++;
    totalsRow(totalRow, opts.totalLabel, `${afterDiscRef}+E${momsRow}`, {
      highlight: opts.highlightColor,
    });

    return { nextRow: r, totalRow };
  }

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
  const eng = emitSection({
    startRow: SP + 2,
    heading: "ENGÅNGSKOSTNAD (faktureras vid projektstart)",
    items: projectItems,
    totalLabel: "TOTALT (inkl. moms)",
    highlightColor: DARK,
  });

  setRowHeight(eng.nextRow, 14);
  let cursor = eng.nextRow + 1;

  // ÅTERKOMMANDE MÅNADSKOSTNAD
  const mon = emitSection({
    startRow: cursor,
    heading: "ÅTERKOMMANDE MÅNADSKOSTNAD (faktureras månadsvis)",
    items: monthlyItems,
    totalLabel: "PER MÅNAD (inkl. moms)",
    highlightColor: BRAND,
  });
  cursor = mon.nextRow;

  // Årskostnad refererar månads-totalen direkt så den uppdateras med formler.
  const MY = cursor++;
  setMerge(`C${MY}:D${MY}`, "Årskostnad (inkl. moms)", {
    font: { ...fGrey, italic: true },
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  setMerge(`E${MY}:F${MY}`, { formula: `E${mon.totalRow}*12` }, {
    font: { ...fGrey, italic: true },
    alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  });
  ws.getCell(`E${MY}`).numFmt = numFmt;
  setRowHeight(MY, 18);

  setRowHeight(cursor, 14);
  cursor++;

  // ========================================
  // ÖVRIGA KOSTNADER (visas endast om fältet är ifyllt)
  // ========================================
  if (offer.other_costs && offer.other_costs.trim()) {
    const OC = cursor++;
    set(`B${OC}`, "ÖVRIGA KOSTNADER", { font: fHeading });
    sectionUnderline(OC);
    setRowHeight(OC, 22);

    const lines = offer.other_costs.split(/\r?\n/).filter((l) => l.length > 0);
    const linesNeeded = Math.max(lines.length, 2);
    const ocFirst = cursor;
    const ocLast = cursor + linesNeeded - 1;
    setMerge(`B${ocFirst}:F${ocLast}`, offer.other_costs, {
      font: fNormal,
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
    });
    for (let r = ocFirst; r <= ocLast; r++) setRowHeight(r, 18);
    cursor = ocLast + 1;

    // En liten kursiv förklaring under
    const note = cursor++;
    setMerge(`B${note}:F${note}`,
      "Ovanstående kostnader är rörliga / villkorade och ingår inte i totalsumman ovan.",
      { font: { ...fGrey, italic: true }, alignment: { vertical: "middle", horizontal: "left" } },
    );
    setRowHeight(note, 18);

    setRowHeight(cursor, 14);
    cursor++;
  }

  // ========================================
  // VILLKOR
  // ========================================
  const V = cursor;
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

  setRowHeight(SIG + 1, 36);

  const sigLine = { bottom: { style: "thin" as const, color: { argb: "FF000000" } } };

  ws.mergeCells(`B${SIG + 2}:C${SIG + 2}`);
  ws.getCell(`B${SIG + 2}`).border = sigLine;
  ws.getCell(`C${SIG + 2}`).border = sigLine;
  ws.mergeCells(`E${SIG + 2}:F${SIG + 2}`);
  ws.getCell(`E${SIG + 2}`).border = sigLine;
  ws.getCell(`F${SIG + 2}`).border = sigLine;
  setRowHeight(SIG + 2, 22);

  setRowHeight(SIG + 3, 14);
  setMerge(`B${SIG + 3}:C${SIG + 3}`, "Ort och datum", { font: fSmall });
  setMerge(`E${SIG + 3}:F${SIG + 3}`, "Ort och datum", { font: fSmall });

  setRowHeight(SIG + 4, 36);

  ws.mergeCells(`B${SIG + 5}:C${SIG + 5}`);
  ws.getCell(`B${SIG + 5}`).border = sigLine;
  ws.getCell(`C${SIG + 5}`).border = sigLine;
  ws.mergeCells(`E${SIG + 5}:F${SIG + 5}`);
  ws.getCell(`E${SIG + 5}`).border = sigLine;
  ws.getCell(`F${SIG + 5}`).border = sigLine;
  setRowHeight(SIG + 5, 22);

  setMerge(`B${SIG + 6}:C${SIG + 6}`, "Underskrift — För Triad Solutions", { font: fSmall });
  setMerge(`E${SIG + 6}:F${SIG + 6}`, "Underskrift — För kunden", { font: fSmall });
  setRowHeight(SIG + 6, 14);

  setMerge(`B${SIG + 7}:C${SIG + 7}`, "[Namnförtydligande]", { font: fGrey });
  setMerge(`E${SIG + 7}:F${SIG + 7}`, "[Namnförtydligande]", { font: fGrey });
  setRowHeight(SIG + 7, 14);

  setRowHeight(SIG + 8, 20);
  setMerge(`B${SIG + 9}:F${SIG + 9}`, "Tack för förtroendet!", {
    font: { name: FONT, size: 11, italic: true, color: { argb: BRAND } },
    alignment: { vertical: "middle", horizontal: "center" },
  });
  setRowHeight(SIG + 9, 22);

  ws.pageSetup.printArea = `A1:G${SIG + 9}`;

  // exceljs writeBuffer returns a Node Buffer at runtime; TS types disagree
  // between Node/edge Buffer variants, so cast to a runtime-compatible shape.
  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Uint8Array;
}

// Läser bredd/höjd ur en PNG-fils IHDR-chunk (bytes 16–23, big-endian).
function readPngDimensions(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = dv.getUint32(16, false);
  const height = dv.getUint32(20, false);
  return { width, height };
}

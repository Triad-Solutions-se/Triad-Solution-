// Delade block-primitiver för avtals-PDF:er (SaaS-avtal, PUB-avtal, Villkor).
// Tar emot en pdf-lib renderer (Pdf-klassen) och en lista med Block-objekt.
//
// Block-modellen är medvetet enkel: h1/h2/p/bullets/callout/meta/table/
// signatures/space. Komplexare layouter (försättssida, signaturkolumner)
// utförs av drawContractCover/signatureColumns nedan.

import { PDFImage } from "pdf-lib";
import {
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
  ROSE,
  Pdf,
} from "./offer-pdf";

export type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "callout"; kind: "info" | "warn"; text: string }
  | { t: "meta"; rows: MetaRow[] }
  | { t: "table"; headers: string[]; rows: string[][]; widths: number[] }
  | { t: "signatures"; left: string; right: string }
  | { t: "space"; h: number };

// En metarad: label + value. Value kan innehålla "röda" segment som markeras
// i utdata-PDF:en (matchar källans röda platshållare i docx/pages-mallarna).
export type MetaRow = {
  label: string;
  value: string;
  // Alternativt: värdet som en sekvens av segment där varje segment kan färgas.
  segments?: { text: string; red?: boolean; bold?: boolean }[];
};

const BODY = 10;

export function para(
  p: Pdf,
  text: string,
  opts: { indent?: number; size?: number; color?: any; font?: any } = {},
) {
  const size = opts.size ?? BODY;
  const lh = size * 1.4;
  const font = opts.font ?? p.font;
  const indent = opts.indent ?? 0;
  const x = MARGIN + indent;
  const width = CONTENT_W - indent;
  for (const line of p.wrap(text, font, size, width)) {
    p.newPageIfNeeded(lh);
    p.drawText(line, x, p.cursor, { font, size, color: opts.color ?? BLACK });
    p.cursor += lh;
  }
}

export function bullet(p: Pdf, text: string) {
  const size = BODY;
  const lh = size * 1.4;
  const bx = MARGIN + 6;
  const tx = MARGIN + 20;
  const width = CONTENT_W - 20;
  const lines = p.wrap(text, p.font, size, width);
  lines.forEach((line, i) => {
    p.newPageIfNeeded(lh);
    if (i === 0) {
      p.drawText("•", bx, p.cursor, { font: p.fontBold, size, color: BRAND });
    }
    p.drawText(line, tx, p.cursor, { size });
    p.cursor += lh;
  });
}

export function calloutBlock(p: Pdf, kind: "info" | "warn", text: string) {
  const size = 9;
  const lh = size * 1.45;
  const padX = 10;
  const padY = 8;
  const barW = 3;
  const innerW = CONTENT_W - padX * 2 - barW;
  const lines = p.wrap(text, p.fontItalic, size, innerW);
  const boxH = lines.length * lh + padY * 2;
  p.newPageIfNeeded(boxH + 6);
  const accent = kind === "warn" ? AMBER : BRAND;
  p.drawRect(MARGIN, p.cursor, CONTENT_W, boxH, LIGHT);
  p.drawRect(MARGIN, p.cursor, barW, boxH, accent);
  let y = p.cursor + padY;
  for (const line of lines) {
    p.drawText(line, MARGIN + barW + padX, y, {
      font: p.fontItalic,
      size,
      color: kind === "warn" ? AMBER : DARK,
    });
    y += lh;
  }
  p.cursor += boxH + 8;
}

export function metaBlock(p: Pdf, rows: MetaRow[]) {
  const size = 10;
  const lh = 14;
  const labelW = 160;
  const padX = 10;
  const padY = 9;
  const gap = 5;
  const valueW = CONTENT_W - labelW - padX * 2;

  // Beräkna höjd per rad (antal wrappade rader för value).
  const rowLineCounts = rows.map((r) => {
    if (r.segments && r.segments.length > 0) {
      // Wrap segmenten som hopslagen sträng för att veta hur många rader
      const joined = r.segments.map((s) => s.text).join("");
      return Math.max(1, p.wrap(joined, p.font, size, valueW).length);
    }
    return Math.max(1, p.wrap(r.value, p.font, size, valueW).length);
  });
  const innerH =
    rowLineCounts.reduce((a, n) => a + n * lh, 0) + (rows.length - 1) * gap;
  const boxH = innerH + padY * 2;
  p.newPageIfNeeded(boxH + 6);
  p.drawRect(MARGIN, p.cursor, CONTENT_W, boxH, LIGHT, {
    color: BORDER,
    width: 0.5,
  });
  let y = p.cursor + padY;
  rows.forEach((r, i) => {
    p.drawText(r.label, MARGIN + padX, y, {
      font: p.fontBold,
      size,
      color: DARK,
      width: labelW - 6,
    });
    if (r.segments && r.segments.length > 0) {
      drawSegments(p, r.segments, MARGIN + padX + labelW, y, valueW, size, lh);
    } else {
      const vlines = p.wrap(r.value, p.font, size, valueW);
      let vy = y;
      for (const line of vlines) {
        p.drawText(line, MARGIN + padX + labelW, vy, { size, color: BLACK });
        vy += lh;
      }
    }
    y += rowLineCounts[i] * lh + gap;
  });
  p.cursor += boxH + 10;
}

// Rita en sekvens av text-segment på samma rad. Bryter när bredden är slut.
// Stöder per-segment färg (röd för platshållare) och bold.
function drawSegments(
  p: Pdf,
  segments: { text: string; red?: boolean; bold?: boolean }[],
  x: number,
  topY: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
) {
  let cx = x;
  let cy = topY;
  for (const seg of segments) {
    const font = seg.bold ? p.fontBold : p.font;
    const color = seg.red ? ROSE : BLACK;
    // Bryt segmentet ord-för-ord
    const words = seg.text.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      const w = font.widthOfTextAtSize(word, size);
      if (cx + w > x + maxWidth && cx > x) {
        cy += lineHeight;
        cx = x;
        // Ledande whitespace i ny rad: hoppa över
        if (/^\s+$/.test(word)) continue;
      }
      p.drawText(word, cx, cy, { font, size, color });
      cx += w;
    }
  }
}

export function tableBlock(
  p: Pdf,
  headers: string[],
  rows: string[][],
  widths: number[],
) {
  const size = 9;
  const lh = 12;
  const padX = 6;
  const padY = 5;
  const cols = widths.map((w) => w * CONTENT_W);
  const xs: number[] = [];
  let acc = MARGIN;
  for (const w of cols) {
    xs.push(acc);
    acc += w;
  }

  const drawRow = (
    cells: string[],
    o: { header?: boolean; bg?: any } = {},
  ) => {
    const font = o.header ? p.fontBold : p.font;
    const color = o.header ? WHITE : BLACK;
    const wrapped = cells.map((c, i) =>
      p.wrap(c, font, size, cols[i] - padX * 2),
    );
    const rowH = Math.max(...wrapped.map((w) => w.length)) * lh + padY * 2;
    p.newPageIfNeeded(rowH);
    const bg = o.header ? DARK : o.bg;
    if (bg) p.drawRect(MARGIN, p.cursor, CONTENT_W, rowH, bg);
    p.drawLine(MARGIN, MARGIN + CONTENT_W, p.cursor + rowH, BORDER, 0.5);
    wrapped.forEach((lines, i) => {
      let y = p.cursor + padY;
      for (const line of lines) {
        p.drawText(line, xs[i] + padX, y, { font, size, color });
        y += lh;
      }
    });
    p.cursor += rowH;
  };

  drawRow(headers, { header: true });
  rows.forEach((r, i) => drawRow(r, { bg: i % 2 === 1 ? LIGHT : null }));
  p.cursor += 10;
}

export function signatureColumns(p: Pdf, leftTitle: string, rightTitle: string) {
  p.newPageIfNeeded(150);
  const colW = (CONTENT_W - 30) / 2;
  const startY = p.cursor;
  const draw = (x: number, title: string) => {
    let y = startY;
    p.drawText(title, x, y, { font: p.fontBold, size: 10, color: DARK, width: colW });
    y += 50;
    p.drawLine(x, x + colW, y, BLACK, 0.5);
    p.drawText("Underskrift", x, y + 4, { size: 8, color: GREY });
    y += 36;
    p.drawLine(x, x + colW, y, BLACK, 0.5);
    p.drawText("Namn och befattning", x, y + 4, { size: 8, color: GREY });
    y += 36;
    p.drawLine(x, x + colW, y, BLACK, 0.5);
    p.drawText("Datum och ort", x, y + 4, { size: 8, color: GREY });
    return y + 16;
  };
  const endL = draw(MARGIN, leftTitle);
  const endR = draw(MARGIN + colW + 30, rightTitle);
  p.cursor = Math.max(endL, endR);
}

export function renderBlocks(p: Pdf, blocks: Block[]) {
  for (const b of blocks) {
    switch (b.t) {
      case "h1": {
        p.newPageIfNeeded(40);
        p.cursor += 6;
        p.drawText(b.text, MARGIN, p.cursor, {
          font: p.fontBold,
          size: 13,
          color: DARK,
        });
        const lineY = p.cursor + 17;
        p.drawLine(MARGIN, MARGIN + CONTENT_W, lineY, BRAND, 1.5);
        p.cursor = lineY + 10;
        break;
      }
      case "h2": {
        p.newPageIfNeeded(28);
        p.cursor += 2;
        p.drawText(b.text, MARGIN, p.cursor, {
          font: p.fontBold,
          size: 11,
          color: DARK,
        });
        p.cursor += 18;
        break;
      }
      case "p":
        para(p, b.text);
        p.cursor += 6;
        break;
      case "bullets":
        for (const it of b.items) bullet(p, it);
        p.cursor += 8;
        break;
      case "callout":
        calloutBlock(p, b.kind, b.text);
        break;
      case "meta":
        metaBlock(p, b.rows);
        break;
      case "table":
        tableBlock(p, b.headers, b.rows, b.widths);
        break;
      case "signatures":
        signatureColumns(p, b.left, b.right);
        break;
      case "space":
        p.cursor += b.h;
        break;
    }
  }
}

// Försättssida för ett avtal: logo + stor rubrik + brand-divider + titel.
export function drawContractCover(
  p: Pdf,
  logo: PDFImage | null,
  bigLabel: string, // "AVTAL" / "VILLKOR" / "PUB-AVTAL" (visas top-right)
  title: string,
  subtitle: string,
) {
  if (logo) {
    p.drawImage(logo, MARGIN, MARGIN, 60, 60);
  } else {
    p.drawText("TRIAD SOLUTIONS", MARGIN, MARGIN + 18, {
      font: p.fontBold,
      size: 18,
      color: BRAND,
    });
  }
  p.drawText(bigLabel, MARGIN, MARGIN + 10, {
    font: p.fontBold,
    size: 20,
    color: GREY,
    width: CONTENT_W,
    align: "right",
  });
  const dividerY = MARGIN + 70;
  p.drawLine(MARGIN, MARGIN + CONTENT_W, dividerY, BRAND, 2);
  p.cursor = dividerY + 22;
  p.drawText(title, MARGIN, p.cursor, { font: p.fontBold, size: 22, color: DARK });
  p.cursor += 26;
  p.drawText(subtitle, MARGIN, p.cursor, {
    font: p.fontItalic,
    size: 11,
    color: BRAND,
  });
  p.cursor += 26;
}

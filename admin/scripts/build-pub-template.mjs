// Bygger en PUB-mall (.docx) från en innehållsfil i scripts/pub-mallar/.
//
//   node scripts/build-pub-template.mjs webbplats
//   → docs/pub-mallar/PUB-Avtal-webbplats.docx
//
// Docx:en följer exakt de konventioner som src/lib/docx-parse.ts läser:
//   h1 = bold + färg 1F3864, h2 = bold + färg 2E5496 (direkt på run-nivå),
//   punktlistor = w:numPr, platshållare = röd (C00000) text inom [hakparentes],
//   meta-rader = stycken på formen "Etikett: värde".
// Inga beroenden — zip skrivs för hand (DEFLATE via node:zlib).

import { deflateRawSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const H1_COLOR = "1F3864";
const H2_COLOR = "2E5496";
const RED = "C00000";
const PLACEHOLDER_RE = /(\[[^\]]+\])/;

// =====================================================================
// WordprocessingML
// =====================================================================

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function run(text, { bold, color, size } = {}) {
  if (!text) return "";
  const rPr =
    (bold ? "<w:b/>" : "") +
    (color ? `<w:color w:val="${color}"/>` : "") +
    (size ? `<w:sz w:val="${size}"/>` : "");
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

// Delar upp text så att [PLATSHÅLLARE] blir egna röda runs.
function runs(text, opts = {}) {
  return text
    .split(PLACEHOLDER_RE)
    .map((part) =>
      PLACEHOLDER_RE.test(part) ? run(part, { ...opts, color: RED }) : run(part, opts),
    )
    .join("");
}

function para(inner, pPr = "") {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${inner}</w:p>`;
}

const EMPTY_P = "<w:p/>";

function cell(inner, widthPct, { shade } = {}) {
  const tcPr =
    `<w:tcW w:w="${Math.round(widthPct * 50)}" w:type="pct"/>` +
    (shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : "");
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${inner}</w:tc>`;
}

function table(rowsXml) {
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("") +
    `</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>` +
    `<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    rowsXml.join("") +
    `</w:tbl>`
  );
}

function headerRow(cells, widthPct) {
  return (
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    cells
      .map((c) => cell(para(run(c, { bold: true, color: "FFFFFF" })), widthPct, { shade: H1_COLOR }))
      .join("") +
    `</w:tr>`
  );
}

function blockXml(b) {
  switch (b.t) {
    case "h1":
      return para(
        run(b.text, { bold: true, color: H1_COLOR, size: 28 }),
        `<w:keepNext/><w:spacing w:before="360" w:after="120"/>`,
      );
    case "h2":
      return para(
        run(b.text, { bold: true, color: H2_COLOR, size: 24 }),
        `<w:keepNext/><w:spacing w:before="200" w:after="80"/>`,
      );
    case "p":
      return para(runs(b.text));
    case "bullets":
      return b.items
        .map((it) => para(runs(it), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`))
        .join("");
    case "meta":
      // Tomt stycke före/efter så att parsern inte slår ihop intilliggande grupper.
      return (
        EMPTY_P +
        b.rows
          .map(([label, value]) =>
            para(run(`${label}: `, { bold: true }) + runs(value), `<w:spacing w:after="60"/>`),
          )
          .join("") +
        EMPTY_P
      );
    case "table": {
      const w = 100 / b.headers.length;
      return (
        table([
          headerRow(b.headers, w),
          ...b.rows.map((r) => `<w:tr>${r.map((c) => cell(para(runs(c)), w)).join("")}</w:tr>`),
        ]) + EMPTY_P
      );
    }
    case "signatures": {
      const line = (label) =>
        `<w:tr><w:trPr><w:trHeight w:val="1000" w:hRule="atLeast"/></w:trPr>` +
        [0, 1]
          .map(() =>
            `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/><w:vAlign w:val="bottom"/></w:tcPr>` +
            para(run(label, { color: "7F7F7F", size: 18 })) +
            `</w:tc>`,
          )
          .join("") +
        `</w:tr>`;
      return (
        table([
          headerRow([b.left, b.right], 50),
          line("Underskrift"),
          line("Namn och befattning"),
          line("Datum och ort"),
        ]) + EMPTY_P
      );
    }
    default:
      throw new Error(`Okänd blocktyp: ${b.t}`);
  }
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function documentXml(blocks) {
  return (
    `${XML_DECL}<w:document ${W_NS} ${R_NS}><w:body>` +
    blocks.map(blockXml).join("") +
    `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

function headerXml(title) {
  return (
    `${XML_DECL}<w:hdr ${W_NS}>` +
    para(
      run(title, { bold: true, color: H1_COLOR, size: 20 }),
      `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${H2_COLOR}"/></w:pBdr>`,
    ) +
    `</w:hdr>`
  );
}

const STYLES_XML =
  `${XML_DECL}<w:styles ${W_NS}><w:docDefaults>` +
  `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `<w:sz w:val="21"/><w:lang w:val="sv-SE"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  `</w:styles>`;

const NUMBERING_XML =
  `${XML_DECL}<w:numbering ${W_NS}><w:abstractNum w:abstractNumId="0">` +
  `<w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/>` +
  `<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const CONTENT_TYPES_XML =
  `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
  `</Types>`;

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const ROOT_RELS_XML =
  `${XML_DECL}<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC_RELS_XML =
  `${XML_DECL}<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_TYPE}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_TYPE}/numbering" Target="numbering.xml"/>` +
  `<Relationship Id="rId3" Type="${REL_TYPE}/header" Target="header1.xml"/></Relationships>`;

// =====================================================================
// ZIP-skrivare (DEFLATE)
// =====================================================================

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const comp = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8-filnamn
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt32LE(0x00210000, 10); // dos time/date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0x00210000, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// =====================================================================
// main
// =====================================================================

const name = process.argv[2];
if (!name) {
  console.error("Användning: node scripts/build-pub-template.mjs <namn>   (t.ex. webbplats)");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const { meta, blocks } = await import(join(here, "pub-mallar", `${name}.content.mjs`));

const docx = zip([
  ["[Content_Types].xml", CONTENT_TYPES_XML],
  ["_rels/.rels", ROOT_RELS_XML],
  ["word/document.xml", documentXml(blocks)],
  ["word/_rels/document.xml.rels", DOC_RELS_XML],
  ["word/styles.xml", STYLES_XML],
  ["word/numbering.xml", NUMBERING_XML],
  ["word/header1.xml", headerXml(meta.headerTitle)],
]);

const outPath = join(here, "..", "docs", "pub-mallar", meta.fileName);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, docx);
console.log(`Skrev ${outPath} (${(docx.length / 1024).toFixed(1)} kB)`);
console.log(`Ladda upp i portalen som "${meta.templateName}" — ${meta.templateDescription}`);

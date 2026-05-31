// Minimal docx-parser för PUB-mall-uppladdning. Läser document.xml ur
// docx (zip), extraherar paragrafer/runs med färg + bold, och bygger en
// Block-struktur som matchar contract-blocks.ts (h1/h2/p/bullets/table/meta).
//
// Designkrav: pure JS, ingen extern dependency, fungerar i Vercel serverless.
// Zip-läsaren stöder STORED (method 0) och DEFLATE (method 8) — vilket är
// allt en .docx någonsin använder.

import { inflateRawSync } from "node:zlib";
import type { Block, MetaRow } from "./contract-blocks";

// =====================================================================
// ZIP-läsare
// =====================================================================

function u16(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}
function u32(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

export function extractZipEntry(zip: Uint8Array, name: string): Uint8Array | null {
  // Hitta End of Central Directory (EOCD), signatur 0x06054b50.
  // Den ligger nära slutet; sök bakåt max 65557 bytes (max-kommentarslängd).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const totalEntries = u16(zip, eocd + 10);
  const cdOffset = u32(zip, eocd + 16);

  const nameBytes = new TextEncoder().encode(name);
  let off = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (u32(zip, off) !== 0x02014b50) break;
    const method = u16(zip, off + 10);
    const compSize = u32(zip, off + 20);
    const nameLen = u16(zip, off + 28);
    const extraLen = u16(zip, off + 30);
    const commentLen = u16(zip, off + 32);
    const localOff = u32(zip, off + 42);
    const entryName = zip.subarray(off + 46, off + 46 + nameLen);

    if (entryName.length === nameBytes.length) {
      let match = true;
      for (let j = 0; j < nameLen; j++) {
        if (entryName[j] !== nameBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        if (u32(zip, localOff) !== 0x04034b50) return null;
        const lhNameLen = u16(zip, localOff + 26);
        const lhExtraLen = u16(zip, localOff + 28);
        const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
        const data = zip.subarray(dataStart, dataStart + compSize);
        if (method === 0) return data;
        if (method === 8) return inflateRawSync(data);
        return null;
      }
    }

    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// =====================================================================
// XML-walker (tar bort prefix, returnerar enkel trädstruktur)
// =====================================================================

type XNode = {
  tag: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

// Mycket lättviktig XML-parser anpassad för OOXML (docx). Klarar:
//  - element med attribut
//  - self-closing element <w:b/>
//  - kapslade element
//  - textinnehåll
//  - CDATA, PI (deklaration) och kommentarer ignoreras/hoppas över
function parseXml(src: string): XNode {
  let i = 0;
  const root: XNode = { tag: "#root", attrs: {}, children: [] };
  const stack: XNode[] = [root];

  while (i < src.length) {
    if (src[i] !== "<") {
      // Text-content
      const end = src.indexOf("<", i);
      const text = end < 0 ? src.slice(i) : src.slice(i, end);
      const trimmed = text.replace(/^\s+|\s+$/g, "");
      if (trimmed.length > 0) {
        stack[stack.length - 1].children.push(decodeEntities(text));
      }
      i = end < 0 ? src.length : end;
      continue;
    }

    // <-element
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end > 0) {
        const text = src.slice(i + 9, end);
        stack[stack.length - 1].children.push(text);
      }
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src[i + 1] === "/") {
      // Closing tag
      const end = src.indexOf(">", i + 2);
      if (end < 0) break;
      stack.pop();
      i = end + 1;
      continue;
    }

    // Opening / self-closing tag
    const end = src.indexOf(">", i + 1);
    if (end < 0) break;
    let body = src.slice(i + 1, end);
    const selfClosing = body.endsWith("/");
    if (selfClosing) body = body.slice(0, -1);
    body = body.replace(/^\s+|\s+$/g, "");

    // Extract tag name
    const spaceIdx = body.search(/\s/);
    const tag = spaceIdx < 0 ? body : body.slice(0, spaceIdx);
    const attrSrc = spaceIdx < 0 ? "" : body.slice(spaceIdx + 1);

    const attrs: Record<string, string> = {};
    if (attrSrc) {
      const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attrSrc))) {
        attrs[m[1]] = decodeEntities(m[2]);
      }
    }

    const node: XNode = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = end + 1;
  }
  return root;
}

// Strippa namespace-prefix (w:p → p) för att förenkla matchning.
function localName(tag: string): string {
  const i = tag.indexOf(":");
  return i < 0 ? tag : tag.slice(i + 1);
}

function* findAll(node: XNode, tagName: string): Generator<XNode> {
  for (const c of node.children) {
    if (typeof c === "string") continue;
    if (localName(c.tag) === tagName) yield c;
    yield* findAll(c, tagName);
  }
}
function findFirstChild(node: XNode, tagName: string): XNode | null {
  for (const c of node.children) {
    if (typeof c === "string") continue;
    if (localName(c.tag) === tagName) return c;
  }
  return null;
}
function findChildren(node: XNode, tagName: string): XNode[] {
  return node.children.filter(
    (c): c is XNode => typeof c !== "string" && localName(c.tag) === tagName,
  );
}

// =====================================================================
// Docx → Block[]
// =====================================================================

// Färger som triggar "röd platshållare". I docx kan röd vara C00000,
// FF0000, eller liknande — vi accepterar alla med mycket högt R och låga G/B.
function isRedColor(val: string | undefined): boolean {
  if (!val || val === "auto") return false;
  if (val.length !== 6) return false;
  const r = parseInt(val.slice(0, 2), 16);
  const g = parseInt(val.slice(2, 4), 16);
  const b = parseInt(val.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  return r >= 150 && g <= 80 && b <= 80;
}

// Heuristik: rubriker i mallarna har mörkblå färg + bold.
// 1F3864 → h1; 2E5496 → h2 (Word default heading-färger).
function colorRole(val: string | undefined): "h1" | "h2" | null {
  if (!val || val.length !== 6) return null;
  const r = parseInt(val.slice(0, 2), 16);
  const g = parseInt(val.slice(2, 4), 16);
  const b = parseInt(val.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  // Mörkblå (~1F3864)
  if (r < 60 && g < 80 && b > 80 && b < 130) return "h1";
  // Medelblå (~2E5496)
  if (r < 80 && g < 110 && b > 120 && b < 180) return "h2";
  return null;
}

type Run = { text: string; bold?: boolean; italic?: boolean; red?: boolean; colorRole?: "h1" | "h2" | null };

function runsFromRow(row: XNode): Run[] {
  const out: Run[] = [];
  for (const r of findAll(row, "r")) {
    out.push(parseRun(r));
  }
  return out;
}

function parseRun(r: XNode): Run {
  const rPr = findFirstChild(r, "rPr");
  let bold = false;
  let italic = false;
  let red = false;
  let colorR: "h1" | "h2" | null = null;
  if (rPr) {
    if (findFirstChild(rPr, "b")) bold = true;
    if (findFirstChild(rPr, "i")) italic = true;
    const color = findFirstChild(rPr, "color");
    if (color) {
      const val = color.attrs["w:val"];
      if (isRedColor(val)) red = true;
      colorR = colorRole(val);
    }
  }
  let text = "";
  for (const c of r.children) {
    if (typeof c === "string") continue;
    const ln = localName(c.tag);
    if (ln === "t") {
      for (const cc of c.children) if (typeof cc === "string") text += cc;
    } else if (ln === "tab") text += "\t";
    else if (ln === "br") text += "\n";
  }
  return { text, bold, italic, red, colorRole: colorR };
}

function joinedText(runs: Run[]): string {
  return runs.map((r) => r.text).join("").trim();
}

function hasNumPr(p: XNode): boolean {
  const pPr = findFirstChild(p, "pPr");
  if (!pPr) return false;
  return !!findFirstChild(pPr, "numPr");
}

function pStyleVal(p: XNode): string | null {
  const pPr = findFirstChild(p, "pPr");
  if (!pPr) return null;
  const ps = findFirstChild(pPr, "pStyle");
  return ps?.attrs["w:val"] ?? null;
}

// Slå ihop angränsande runs med samma röd/bold-status så vi inte ritar
// massa pyttesmå fragment.
function compactRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!r.bold && !!last.red === !!r.red) {
      last.text += r.text;
    } else {
      out.push({ text: r.text, bold: r.bold, red: r.red });
    }
  }
  return out;
}

// Tablecell → en sträng (vi förlorar inline-formatering i tabellceller men
// behåller alla röda placeholders som platta strängar).
function cellText(tc: XNode): string {
  const parts: string[] = [];
  for (const p of findAll(tc, "p")) {
    const runs: Run[] = [];
    for (const r of findChildren(p, "r")) runs.push(parseRun(r));
    const txt = joinedText(runs);
    if (txt) parts.push(txt);
  }
  return parts.join(" ").trim();
}

// =====================================================================
// Block-bygge med flush av öppna sub-listor och meta-rader.
// =====================================================================

class BlockBuilder {
  blocks: Block[] = [];
  private pendingBullets: { items: string[] } | null = null;
  private pendingMeta: MetaRow[] | null = null;

  flushBullets() {
    if (this.pendingBullets && this.pendingBullets.items.length > 0) {
      this.blocks.push({ t: "bullets", items: this.pendingBullets.items });
    }
    this.pendingBullets = null;
  }
  flushMeta() {
    if (this.pendingMeta && this.pendingMeta.length > 0) {
      this.blocks.push({ t: "meta", rows: this.pendingMeta });
    }
    this.pendingMeta = null;
  }
  flush() {
    this.flushBullets();
    this.flushMeta();
  }
  pushBullet(text: string) {
    this.flushMeta();
    if (!this.pendingBullets) this.pendingBullets = { items: [] };
    this.pendingBullets.items.push(text);
  }
  pushMeta(row: MetaRow) {
    this.flushBullets();
    if (!this.pendingMeta) this.pendingMeta = [];
    this.pendingMeta.push(row);
  }
  pushH1(text: string) {
    this.flush();
    this.blocks.push({ t: "h1", text });
  }
  pushH2(text: string) {
    this.flush();
    this.blocks.push({ t: "h2", text });
  }
  pushP(text: string) {
    this.flush();
    this.blocks.push({ t: "p", text });
  }
  pushTable(headers: string[], rows: string[][], widths: number[]) {
    this.flush();
    this.blocks.push({ t: "table", headers, rows, widths });
  }
}

// Detektera om en paragraf ser ut som en "meta-rad" — kort label följd av
// värde, ofta med röda segment. Returnerar MetaRow eller null.
function paragraphAsMetaRow(runs: Run[]): MetaRow | null {
  const text = joinedText(runs);
  if (!text) return null;
  // Mönster: "Label: värde". Label ska inte innehålla röd text.
  const m = text.match(/^([^:]{1,80}):\s+(.{1,500})$/);
  if (!m) return null;
  const labelEnd = m[1].length + 1; // includes ':'

  // Hitta runs efter labelEnd och bygg segments
  const segments: { text: string; red?: boolean; bold?: boolean }[] = [];
  let consumed = 0;
  for (const r of runs) {
    const remain = r.text;
    const start = consumed;
    const end = consumed + remain.length;
    consumed = end;
    if (end <= labelEnd) continue; // helt inom label
    if (start < labelEnd) {
      // Splittra
      const tail = remain.slice(labelEnd - start);
      if (tail.trim()) {
        segments.push({ text: tail.replace(/^\s+/, ""), red: r.red, bold: r.bold });
      }
    } else {
      segments.push({ text: remain, red: r.red, bold: r.bold });
    }
  }
  // Trimma ledande/följande whitespace i segments
  while (segments.length && segments[0].text === "") segments.shift();
  if (segments.length === 0) return null;
  return { label: m[1].trim() + ":", value: "", segments };
}

// Detektera om en paragraf ser ut som en rubrik (bold + heading-färg).
function paragraphAsHeading(runs: Run[]): "h1" | "h2" | null {
  if (runs.length === 0) return null;
  // Måste vara övervägande bold + ha en heading-färg (mörkblå / medelblå
  // som Word använder för Heading1/Heading2-stilen).
  const textRuns = runs.filter((r) => r.text.trim().length > 0);
  if (textRuns.length === 0) return null;
  const allBold = textRuns.every((r) => r.bold);
  if (!allBold) return null;
  const role = textRuns.find((r) => r.colorRole)?.colorRole ?? null;
  return role;
}

export type ParseResult = {
  blocks: Block[];
  // Råa root-paragrafer (för debug-vy / framtida fältmappning)
  rawTextSample: string;
};

export function parseDocxBlocks(xml: string): ParseResult {
  const root = parseXml(xml);
  const doc = findFirstChild(root, "document") ?? root;
  const body = findFirstChild(doc, "body") ?? doc;
  const bb = new BlockBuilder();
  const rawText: string[] = [];

  for (const child of body.children) {
    if (typeof child === "string") continue;
    const ln = localName(child.tag);

    if (ln === "tbl") {
      // Tabell — använd första raden som header om bg är mörk.
      const rows = findChildren(child, "tr");
      if (rows.length === 0) continue;
      const cellTexts: string[][] = rows.map((tr) =>
        findChildren(tr, "tc").map((tc) => cellText(tc)),
      );
      const ncols = Math.max(...cellTexts.map((r) => r.length));
      // Likformig kolumnbredd
      const widths = Array.from({ length: ncols }, () => 1 / ncols);
      const headers = cellTexts[0] ?? [];
      const dataRows = cellTexts.slice(1);
      bb.pushTable(headers, dataRows, widths);
      continue;
    }

    if (ln !== "p") continue;

    const rawRuns = findChildren(child, "r").map(parseRun);
    const runs = compactRuns(rawRuns);
    const text = joinedText(runs);
    if (!text) {
      // Tom paragraf — flush eventuella öppna grupper
      bb.flush();
      continue;
    }
    rawText.push(text);

    // Bullet?
    if (hasNumPr(child)) {
      bb.pushBullet(text);
      continue;
    }

    // Heading? (Använd rawRuns för att inte förlora colorRole)
    const headingRole = paragraphAsHeading(rawRuns);
    if (headingRole === "h1") {
      bb.pushH1(text);
      continue;
    }
    if (headingRole === "h2") {
      bb.pushH2(text);
      continue;
    }

    // Meta-rad? (Label: värde-mönster, ofta med röda värden)
    const meta = paragraphAsMetaRow(runs);
    if (meta) {
      bb.pushMeta(meta);
      continue;
    }

    // Vanlig paragraf — om den innehåller röda segment, gör om till
    // en "p"-block men förlora färginfo (vi har ingen p-segment-typ).
    // För renderaren räcker det att substitutionen sker före rendering.
    bb.pushP(text);
  }
  bb.flush();

  return { blocks: bb.blocks, rawTextSample: rawText.slice(0, 20).join("\n") };
}

// =====================================================================
// Publikt API: parsa docx-buffer till Block[]
// =====================================================================

export async function parseDocxToBlocks(buf: Uint8Array): Promise<ParseResult> {
  const docXml = extractZipEntry(buf, "word/document.xml");
  if (!docXml) {
    throw new Error("Hittade inte word/document.xml i den uppladdade filen.");
  }
  const xmlString = new TextDecoder("utf-8").decode(docXml);
  return parseDocxBlocks(xmlString);
}

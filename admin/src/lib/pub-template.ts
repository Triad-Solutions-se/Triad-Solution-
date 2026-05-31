// PUB-mall: substituering av röda platshållare + PDF-rendering.
//
// Den uppladdade docx:en parseras med docx-parse.ts till Block[]. Dessa block
// lagras som JSON i pub_templates.extracted_blocks. På render-tid hämtar vi
// blocken, kör substituteFields() för att fylla i kund-/företagsdata, och
// renderar via samma pdf-lib-pipeline som SaaS-avtal/Villkor.
//
// Substitueringen är ORDNINGS-baserad: [ORG.NR] förekommer två gånger i
// PUB-mallen (kund + leverantör), och vi avgör vilken som är vilken baserat
// på ordningen de uppträder. Reglerna är dokumenterade i PUB_SUB_RULES nedan.

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4_W,
  A4_H,
  Pdf,
  loadLogo,
  fmtDateSv,
} from "./offer-pdf";
import {
  type Block,
  type MetaRow,
  renderBlocks,
  drawContractCover,
} from "./contract-blocks";
import type { CompanyInfo } from "./company";

export type PubCustomer = {
  name: string | null;
  org_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
};

export type PubSubCtx = {
  customer: PubCustomer | null;
  company: CompanyInfo;
  agreementDate: string | null; // ISO eller sv-SE
  startDate: string | null;
  offerNumber: string | null;
};

// Hjälpfunktioner för fallback-värden (placeholders behålls om data saknas)
function fmtDateOrPlaceholder(d: string | null | undefined, fallback: string): string {
  if (!d) return fallback;
  // Acceptera både ISO och sv-SE
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return fmtDateSv(d);
  return d;
}

// Ordnade substituerings-regler. Vid varje match räknar vi upp en counter
// per placeholder-sträng; reglerna applicerar ordningstal "n" från 1 och upp.
// Matchning är substring-baserad (placeholder hittas var som helst i text).
type SubRule = {
  match: string;
  n: number; // 1 = första förekomsten, 2 = andra, etc.
  value: (ctx: PubSubCtx) => string;
};

export const PUB_SUB_RULES: SubRule[] = [
  // === Kund-meta ===
  { match: "[KUNDENS FÖRETAGSNAMN]", n: 1, value: (c) => c.customer?.name?.trim() || "[KUNDENS FÖRETAGSNAMN]" },
  // [ORG.NR] #1 = kund (PUA), #2 = leverantör (PUB)
  { match: "[ORG.NR]", n: 1, value: (c) => c.customer?.org_number?.trim() || "[ORG.NR]" },
  { match: "[ORG.NR]", n: 2, value: (c) => c.company.orgNumber || "[ORG.NR]" },

  // === Datum ===
  // [ÅÅÅÅ-MM-DD] #1 = avtalsdatum (Avtalsdatum-raden i meta)
  // [ÅÅÅÅ-MM-DD] #2 = startdatum (Relaterat SaaS-avtal "daterat …")
  { match: "[ÅÅÅÅ-MM-DD]", n: 1, value: (c) => fmtDateOrPlaceholder(c.agreementDate, "[ÅÅÅÅ-MM-DD]") },
  { match: "[ÅÅÅÅ-MM-DD]", n: 2, value: (c) => fmtDateOrPlaceholder(c.startDate, "[ÅÅÅÅ-MM-DD]") },

  // === Kontaktperson hos kunden (Avsnitt 11) ===
  { match: "[NAMN]", n: 1, value: (c) => c.customer?.contact_person?.trim() || "[NAMN]" },
  { match: "[ROLL/BEFATTNING]", n: 1, value: () => "[ROLL/BEFATTNING]" }, // ej i DB
  { match: "[E-POSTADRESS]", n: 1, value: (c) => c.customer?.email?.trim() || "[E-POSTADRESS]" },
  // [TELEFONNUMMER] #1 = kund, #2 = leverantör
  { match: "[TELEFONNUMMER]", n: 1, value: (c) => c.customer?.phone?.trim() || "[TELEFONNUMMER]" },
  { match: "[TELEFONNUMMER]", n: 2, value: (c) => c.company.phone || "[TELEFONNUMMER]" },

  // === DPO ===
  { match: "[NAMN eller 'Ej utsett']", n: 1, value: () => "Ej utsett" },

  // === Övrigt som ibland finns i mallar ===
  { match: "[ADRESS]", n: 1, value: (c) => c.customer?.name ? "" : "[ADRESS]" }, // kundadress hanteras i Villkor, ej i PUB
];

// Applicerar regler ordnings-baserat. Returnerar en substitueringsfunktion
// som anropas en gång per textstycke (paragrafer, meta-segments, bullets,
// tabellceller). Funktionen håller egen räknare över hur många gånger varje
// placeholder redan substituerats.
export function makeSubstitutor(ctx: PubSubCtx): (text: string) => string {
  const counts: Map<string, number> = new Map();

  return (text: string): string => {
    let out = text;
    // Hitta alla regler som matchar någon placeholder i texten, i den
    // ordning de förekommer i texten.
    while (true) {
      // Hitta första placeholder-förekomsten i `out`
      let earliest = -1;
      let earliestRule: SubRule | null = null;
      let earliestN = 0;

      for (const rule of PUB_SUB_RULES) {
        const idx = out.indexOf(rule.match);
        if (idx < 0) continue;
        // Detta är förekomst nr (counts[rule.match] || 0) + 1
        const nextN = (counts.get(rule.match) ?? 0) + 1;
        if (rule.n !== nextN) continue;
        if (earliest < 0 || idx < earliest) {
          earliest = idx;
          earliestRule = rule;
          earliestN = nextN;
        }
      }
      if (!earliestRule) break;
      const replacement = earliestRule.value(ctx);
      out = out.slice(0, earliest) + replacement + out.slice(earliest + earliestRule.match.length);
      counts.set(earliestRule.match, earliestN);
    }
    return out;
  };
}

// Walk blocks och kör substituteren. Returnerar en NY block-lista (immutable).
export function substituteBlocks(blocks: Block[], ctx: PubSubCtx): Block[] {
  const sub = makeSubstitutor(ctx);
  const out: Block[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "h1":
      case "h2":
        out.push({ ...b, text: sub(b.text) });
        break;
      case "p":
        out.push({ t: "p", text: sub(b.text) });
        break;
      case "bullets":
        out.push({ t: "bullets", items: b.items.map((it) => sub(it)) });
        break;
      case "callout":
        out.push({ ...b, text: sub(b.text) });
        break;
      case "meta": {
        const newRows: MetaRow[] = b.rows.map((r) => {
          if (r.segments) {
            return {
              label: r.label,
              value: "",
              segments: r.segments.map((seg) => ({ ...seg, text: sub(seg.text) })),
            };
          }
          return { label: r.label, value: sub(r.value) };
        });
        out.push({ t: "meta", rows: newRows });
        break;
      }
      case "table":
        out.push({
          t: "table",
          headers: b.headers.map((h) => sub(h)),
          widths: b.widths,
          rows: b.rows.map((row) => row.map((c) => sub(c))),
        });
        break;
      case "signatures":
        out.push({ ...b });
        break;
      case "space":
        out.push({ ...b });
        break;
    }
  }
  return out;
}

// =====================================================================
// PDF-renderer
// =====================================================================

export async function generatePubFromTemplatePdf(
  blocks: Block[],
  ctx: PubSubCtx,
  templateName: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(
    `PUB-avtal ${ctx.customer?.name ?? ""} ${ctx.offerNumber ?? ""}`.trim(),
  );
  doc.setAuthor(ctx.company.name);
  doc.setCreator("Triad Admin");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([A4_W, A4_H]);
  const p = new Pdf(doc, page, font, fontBold, fontItalic);
  const logo = await loadLogo(doc);

  drawContractCover(
    p,
    logo,
    "AVTAL",
    "PERSONUPPGIFTSBITRÄDESAVTAL",
    templateName || "GDPR Artikel 28",
  );

  const subbed = substituteBlocks(blocks, ctx);
  renderBlocks(p, subbed);

  return await doc.save();
}

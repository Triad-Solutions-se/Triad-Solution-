// Bilaga 1 – Särskilda villkor: ett enskilt avtals avvikelser från Villkoren
// (agreements.special_terms). Renderas efter Villkoren i avtals-PDF:en.
//
// Texten skrivs som enkel markdown, en rad per stycke:
//   ## Rubrik  eller  **Rubrik**   → underrubrik
//   - punkt                        → punktlista
//   övriga rader                   → stycken (**fetstil** rensas bort)
// Inledningen om företräde och underskrifterna läggs till automatiskt.

import type { Block } from "./contract-blocks";
import type { CompanyInfo } from "./company";

export type SpecialTermsCtx = {
  agreementNumber: string | null;
  customerName: string;
};

export function specialTermsIntro(ctx: SpecialTermsCtx, company: CompanyInfo): string {
  const avtal = ctx.agreementNumber ? `avtal ${ctx.agreementNumber}` : "avtalet";
  return (
    `Bilagan hör till ${avtal} mellan ${company.name} (Leverantören) och ` +
    `${ctx.customerName} (Kunden). Vid motstridighet har bilagan företräde ` +
    `framför Villkoren. PUB-avtalet har dock alltid företräde i frågor om ` +
    `behandling av personuppgifter.`
  );
}

export function parseSpecialTerms(text: string): Block[] {
  const blocks: Block[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push({ t: "bullets", items: bullets });
    bullets = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    // "> " i början tas bort, så att text kan klistras in från ett citat.
    const line = raw.replace(/^\s*>\s?/, "").trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/) ?? line.match(/^\*\*([^*]+)\*\*$/);
    const item = line.match(/^[-•*]\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ t: "h2", text: heading[1].replace(/\*\*/g, "").trim() });
    } else if (item) {
      bullets.push(item[1].replace(/\*\*/g, ""));
    } else {
      flush();
      blocks.push({ t: "p", text: line.replace(/\*\*/g, "") });
    }
  }
  flush();
  return blocks;
}

export function specialTermsBlocks(
  text: string,
  ctx: SpecialTermsCtx,
  company: CompanyInfo,
): Block[] {
  return [
    { t: "p", text: specialTermsIntro(ctx, company) },
    { t: "space", h: 4 },
    ...parseSpecialTerms(text),
    { t: "h1", text: "Underskrifter" },
    {
      t: "p",
      text: "Parterna har undertecknat denna bilaga i två likalydande exemplar.",
    },
    { t: "space", h: 10 },
    {
      t: "signatures",
      left: `För Leverantören (${company.name})`,
      right: `För Kunden (${ctx.customerName})`,
    },
  ];
}

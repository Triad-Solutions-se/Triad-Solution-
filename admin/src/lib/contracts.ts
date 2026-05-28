// Genererar SaaS-avtal (bifogas efter offerten i samma PDF) och PUB-avtal
// (separat PDF). Bygger på samma pdf-lib-renderer som offerten (offer-pdf.ts).
//
// Avtalstexterna är transkriberade från mallarna SaaS-Avtal.docx och
// PUB-Avtal.docx. Identitets-/datumfält fylls automatiskt från offert + kund +
// företagskonfig (src/lib/company.ts). Domänspecifika fält som inte kan härledas
// (ändamål, kategorier, underbiträden m.m.) lämnas som [hakparenteser] att fylla
// i för hand.

import { PDFDocument, PDFImage, StandardFonts } from "pdf-lib";
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
  drawOfferContent,
  fmtDateSv,
  type OfferData,
} from "./offer-pdf";
import { CompanyInfo, companyAddressLine } from "./company";

// ---------------------------------------------------------------------------
// Block-modell
// ---------------------------------------------------------------------------

type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "callout"; kind: "info" | "warn"; text: string }
  | { t: "meta"; rows: [string, string][] }
  | { t: "table"; headers: string[]; rows: string[][]; widths: number[] }
  | { t: "signatures"; left: string; right: string }
  | { t: "space"; h: number };

type Ctx = {
  customerName: string;
  customerOrg: string;
  customerAddress: string;
  customerContact: string;
  customerEmail: string;
  customerPhone: string;
  offerNumber: string;
  offerDate: string; // formatted sv-SE
  agreementStart: string; // formatted sv-SE
};

function buildCtx(offer: OfferData): Ctx {
  const c = offer.customer;
  const date = fmtDateSv(offer.offer_date);
  return {
    customerName: c?.name?.trim() || "[KUNDENS FÖRETAGSNAMN]",
    customerOrg: c?.org_number?.trim() || "[ORG.NR]",
    customerAddress: (c?.address?.trim() || "[ADRESS]").replace(/\s*\n\s*/g, ", "),
    customerContact: c?.contact_person?.trim() || "[NAMN]",
    customerEmail: c?.email?.trim() || "[E-POSTADRESS]",
    customerPhone: c?.phone?.trim() || "[TELEFONNUMMER]",
    offerNumber: offer.offer_number?.trim() || "",
    offerDate: date,
    // Avtalsstart antas vara offertdatumet om inget annat anges.
    agreementStart: date,
  };
}

// ---------------------------------------------------------------------------
// Render-hjälpare
// ---------------------------------------------------------------------------

const BODY = 10;
const BODY_LH = 14;

function para(
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

function bullet(p: Pdf, text: string) {
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

function calloutBlock(p: Pdf, kind: "info" | "warn", text: string) {
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

function metaBlock(p: Pdf, rows: [string, string][]) {
  const size = 10;
  const lh = 14;
  const labelW = 160;
  const padX = 10;
  const padY = 9;
  const gap = 5;
  const valueW = CONTENT_W - labelW - padX * 2;
  const rowLines = rows.map(([, v]) =>
    Math.max(1, p.wrap(v, p.font, size, valueW).length),
  );
  const innerH =
    rowLines.reduce((a, n) => a + n * lh, 0) + (rows.length - 1) * gap;
  const boxH = innerH + padY * 2;
  p.newPageIfNeeded(boxH + 6);
  p.drawRect(MARGIN, p.cursor, CONTENT_W, boxH, LIGHT, {
    color: BORDER,
    width: 0.5,
  });
  let y = p.cursor + padY;
  rows.forEach(([label, value], i) => {
    p.drawText(label, MARGIN + padX, y, {
      font: p.fontBold,
      size,
      color: DARK,
      width: labelW - 6,
    });
    const vlines = p.wrap(value, p.font, size, valueW);
    let vy = y;
    for (const line of vlines) {
      p.drawText(line, MARGIN + padX + labelW, vy, { size, color: BLACK });
      vy += lh;
    }
    y += Math.max(1, rowLines[i]) * lh + gap;
  });
  p.cursor += boxH + 10;
}

function tableBlock(
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
    // bottom border
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

function signatureColumns(p: Pdf, leftTitle: string, rightTitle: string) {
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

function renderBlocks(p: Pdf, blocks: Block[]) {
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

function drawContractCover(
  p: Pdf,
  logo: PDFImage | null,
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
  p.drawText("AVTAL", MARGIN, MARGIN + 10, {
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

// ---------------------------------------------------------------------------
// SaaS-avtal innehåll
// ---------------------------------------------------------------------------

function saasBlocks(x: Ctx, company: CompanyInfo): Block[] {
  return [
    {
      t: "meta",
      rows: [
        [
          "Leverantör:",
          `${company.name}, org.nr ${company.orgNumber || "[ORG.NR]"}, ${companyAddressLine(company) || "[ADRESS]"}`,
        ],
        ["Kund:", `${x.customerName}, org.nr ${x.customerOrg}, ${x.customerAddress}`],
        ["Avtalsdatum:", x.offerDate],
        ["Avtalsstart:", x.agreementStart],
        ["Version:", "1.0"],
      ],
    },

    { t: "h1", text: "1. Definitioner" },
    { t: "p", text: "I detta avtal gäller följande definitioner:" },
    {
      t: "bullets",
      items: [
        '"Tjänsten" avser den SaaS-lösning som Leverantören tillhandahåller och som beskrivs i Bilaga 1 (Tjänstebeskrivning).',
        '"Kunden" avser det bolag som angivits ovan och som tecknar detta avtal.',
        '"Leverantören" avser det bolag som angivits ovan och som tillhandahåller Tjänsten.',
        '"Driftstörning" avser ett oplanerat avbrott i Tjänsten som påverkar Kundens möjlighet att använda den normalt.',
        '"Kritisk bugg" avser ett fel som omöjliggör normal användning av Tjänstens kärnfunktionalitet.',
        '"Personuppgifter" avser alla uppgifter som direkt eller indirekt kan identifiera en fysisk person, enligt definition i GDPR.',
        '"Konfidentiell information" avser all information som en part delar med den andra och märker som konfidentiell, eller som till sin natur är konfidentiell.',
      ],
    },

    { t: "h1", text: "2. Tjänstens omfattning" },
    { t: "h2", text: "2.1 Tillhandahållande" },
    {
      t: "p",
      text: "Leverantören tillhandahåller Tjänsten som en molntjänst (SaaS). Leverantören ansvarar för drift, serverkapacitet, säkerhetskopiering och underhåll av Tjänsten under avtalstiden i enlighet med vad som anges i detta avtal.",
    },
    { t: "h2", text: "2.2 Nyttjanderätt" },
    {
      t: "p",
      text: "Kunden erhåller en icke-exklusiv, tidsbegränsad och icke-överlåtbar nyttjanderätt till Tjänsten. Nyttjanderätten gäller enbart för Kundens interna verksamhet och får inte upplåtas till tredje part utan Leverantörens skriftliga medgivande.",
    },
    { t: "h2", text: "2.3 Immateriella rättigheter" },
    {
      t: "p",
      text: "Samtliga immateriella rättigheter till Tjänsten, inklusive källkod, databasstruktur, design, algoritmer och underliggande logik, tillhör uteslutande Leverantören. Inga immateriella rättigheter övergår till Kunden genom detta avtal.",
    },
    {
      t: "p",
      text: "Om Kunden lämnar förslag på förbättringar, feedback eller annan input som implementeras i Tjänsten, tillfaller de immateriella rättigheterna till detta automatiskt Leverantören utan ersättning till Kunden.",
    },
    {
      t: "callout",
      kind: "info",
      text: "Råd: Specificera i Bilaga 1 exakt vilka moduler och funktioner som ingår i Tjänsten. Otydlig tjänstebeskrivning är den vanligaste källan till tvister.",
    },

    { t: "h1", text: "3. Servicenivåavtal (SLA) och tillgänglighet" },
    { t: "h2", text: "3.1 Tillgänglighetsmål" },
    {
      t: "p",
      text: "Leverantören strävar efter en driftstabilitet om 99,5 % mätt per kalendermånad, exklusive planerat underhåll och händelser utanför Leverantörens kontroll (force majeure).",
    },
    {
      t: "table",
      headers: ["Tillgänglighet", "Tillåten nedtid/månad", "Kompensation"],
      widths: [0.3, 0.32, 0.38],
      rows: [
        [">= 99,5 %", "<= 3,6 timmar", "Ingen"],
        ["99,0 – 99,49 %", "3,6 – 7,2 timmar", "5 % kredit på månadsavgift"],
        ["98,0 – 98,99 %", "7,2 – 14,4 timmar", "10 % kredit på månadsavgift"],
        ["< 98,0 %", "> 14,4 timmar", "20 % kredit på månadsavgift"],
      ],
    },
    {
      t: "callout",
      kind: "warn",
      text: "Kredit utgör Kundens enda kompensation vid driftstörning och ger inte rätt till ytterligare skadestånd, om inte grov vårdslöshet föreligger.",
    },
    { t: "h2", text: "3.2 Planerat underhåll" },
    {
      t: "p",
      text: "Planerat underhåll meddelas via e-post eller i systemet senast 48 timmar i förväg och ska i möjligaste mån förläggas till lågtrafiktid (vardagar 22:00–06:00 eller helger). Planerat underhåll räknas inte som driftstörning.",
    },

    { t: "h1", text: "4. Kundens ansvar" },
    { t: "h2", text: "4.1 Dataansvar" },
    {
      t: "p",
      text: "Kunden äger all data som matas in i systemet. Kunden ansvarar för att innehållet i datan inte bryter mot tillämplig lag eller intrång i tredje parts rättigheter. Leverantören ansvarar inte för skada som uppstår på grund av felaktig, olaglig eller vilseledande data som Kunden laddar upp.",
    },
    { t: "h2", text: "4.2 Behörighets- och kontohantering" },
    {
      t: "p",
      text: "Kunden ansvarar för att användaruppgifter och lösenord hanteras konfidentiellt. Kunden ska omedelbart meddela Leverantören om obehörig åtkomst misstänks. Kunden ansvarar för alla aktiviteter som utförs via Kundens konton.",
    },
    { t: "h2", text: "4.3 Tillåten användning" },
    { t: "p", text: "Kunden förbinder sig att inte använda Tjänsten för:" },
    {
      t: "bullets",
      items: [
        "Olaglig verksamhet eller i strid med tillämpliga lagar och förordningar.",
        "Distribution av skadlig kod, spam eller annat skadligt innehåll.",
        "Reverse engineering, dekompilering eller annan form av bakåtkompilering av Tjänsten.",
        "Vidareförsäljning eller upplåtelse av Tjänsten till tredje part utan skriftligt tillstånd.",
      ],
    },

    { t: "h1", text: "5. Ansvarsbegränsning" },
    { t: "h2", text: "5.1 Skadeståndstak" },
    {
      t: "p",
      text: "Leverantörens totala skadeståndsansvar under detta avtal är, oavsett ansvarsbas (avtalsbrott, culpa, produktansvar eller annat), begränsat till ett belopp motsvarande de avgifter Kunden betalat till Leverantören under de senaste tolv (12) kalendermånaderna före den händelse som gav upphov till skadeståndsanspråket.",
    },
    {
      t: "callout",
      kind: "warn",
      text: "Skadeståndstak skyddar dig vid fel. Se till att din ansvarsförsäkring (konsultansvarsförsäkring) täcker minst detta belopp.",
    },
    { t: "h2", text: "5.2 Undantag från ansvar" },
    { t: "p", text: "Leverantören ansvarar under inga omständigheter för:" },
    {
      t: "bullets",
      items: [
        "Indirekta skador, följdskador, utebliven vinst, produktionsbortfall eller förlust av data.",
        "Skada som uppstår till följd av Kundens felaktiga användning av Tjänsten.",
        "Skada som beror på tredjepartsprogramvara, hostingleverantörer eller andra parter utanför Leverantörens kontroll.",
        "Skada till följd av force majeure-händelser (se avsnitt 10).",
      ],
    },
    { t: "h2", text: "5.3 Undantag från begränsningen" },
    { t: "p", text: "Begränsningarna i 5.1 och 5.2 gäller inte vid:" },
    {
      t: "bullets",
      items: [
        "Grov vårdslöshet eller uppsåtlig handling från Leverantörens sida.",
        "Personskada eller dödsfall orsakad av Leverantörens handlande.",
        "Skada som inte lagligen kan begränsas enligt tvingande svensk lag.",
      ],
    },
    {
      t: "callout",
      kind: "info",
      text: "Juridisk rekommendation: Begränsningen till 12 månaders avgifter är branschstandard för SaaS. Vissa kunder kan kräva högre tak – detta är förhandlingsbart men bör alltid speglas i er ansvarsförsäkring.",
    },

    { t: "h1", text: "6. Dataskydd och personuppgifter" },
    {
      t: "p",
      text: "Parterna ska följa tillämplig dataskyddslagstiftning, inklusive EU:s dataskyddsförordning (GDPR, 2016/679). En separat Personuppgiftsbiträdesavtal (PUB-avtal) ska tecknas och utgör en integrerad del av detta avtal. Vid konflikt mellan PUB-avtalet och detta avtal gäller PUB-avtalet avseende behandling av personuppgifter.",
    },
    {
      t: "callout",
      kind: "warn",
      text: "OBS: Utan ett tecknat PUB-avtal bryter BÅDA parter mot GDPR artikel 28. PUB-avtalet MÅSTE vara på plats innan Kunden börjar mata in personuppgifter i systemet.",
    },

    { t: "h1", text: "7. Sekretess" },
    {
      t: "p",
      text: "Båda parter förbinder sig att inte röja konfidentiell information om den andra parten till tredje part under avtalstiden och under 36 månader därefter. Konfidentiell information får enbart användas för att fullgöra förpliktelserna under detta avtal.",
    },
    {
      t: "p",
      text: "Undantag gäller för information som: (i) är eller blir allmänt känd utan att den mottagande parten brutit mot sekretessåtagandet; (ii) var känd för mottagaren redan innan avtalets ingående; eller (iii) ska röjas enligt lag, domstolsbeslut eller myndighetsbeslut.",
    },

    { t: "h1", text: "8. Pris och betalning" },
    {
      t: "bullets",
      items: [
        "Prisjustering sker årligen i januari månad med max 5 % eller i enlighet med KPI (konsumentprisindex), det lägre värdet tillämpas. Kunden meddelas skriftligen senast 60 dagar i förväg.",
      ],
    },

    { t: "h1", text: "9. Avtalstid och uppsägning" },
    { t: "h2", text: "9.1 Avtalstid" },
    {
      t: "p",
      text: "Avtalet gäller i 12 månader från Startdatum och förlängs automatiskt med 12 månader i taget, om det inte sagts upp skriftligen senast 3 månader före utgången av den löpande avtalsperioden.",
    },
    { t: "h2", text: "9.2 Omedelbar uppsägning" },
    {
      t: "p",
      text: "Endera parten äger rätt att säga upp avtalet med omedelbar verkan om den andra parten:",
    },
    {
      t: "bullets",
      items: [
        "Väsentligen bryter mot avtalet och inte vidtar rättelse inom 30 dagar efter skriftlig anmärkning.",
        "Försätts i konkurs, inleder ackordsförhandlingar eller på annat sätt är insolvent.",
      ],
    },
    { t: "h2", text: "9.3 Åtgärder vid avtalets upphörande" },
    {
      t: "p",
      text: "Vid avtalets upphörande ska Leverantören, på Kundens skriftliga begäran, tillhandahålla Kunden möjlighet att exportera sin data i ett maskinläsbart format (CSV, JSON eller liknande) under en period om 30 dagar. Därefter raderas all Kundens data från Leverantörens system.",
    },
    {
      t: "callout",
      kind: "info",
      text: "Sak att tänka på: Lägg till en klausul om dataportabilitet och export-format som du faktiskt kan leverera. Det är ett vanligt krav från kunder och kan annars bli ett hinder i upphandlingar.",
    },

    { t: "h1", text: "10. Force Majeure" },
    {
      t: "p",
      text: "Part är befriad från påföljd för underlåtenhet att fullgöra förpliktelse enligt detta avtal om underlåtenheten beror på omständighet utanför partens kontroll och som parten inte skäligen borde ha kunnat förutse eller undvika, såsom naturkatastrofer, krig, strejk, elavbrott, myndighetsbeslut eller liknande händelse. Part ska utan dröjsmål underrätta den andra parten om en force majeure-händelse och dess förväntade varaktighet.",
    },

    { t: "h1", text: "11. Överlåtelse av avtal" },
    {
      t: "p",
      text: "Ingen av parterna får överlåta sina rättigheter eller skyldigheter enligt detta avtal till tredje part utan den andra partens skriftliga medgivande. Undantag gäller om Leverantören överlåter avtalet till ett närstående bolag eller i samband med en fusion, förvärv eller försäljning av väsentlig del av verksamheten, förutsatt att den förvärvande parten åtar sig att fullgöra avtalets samtliga förpliktelser.",
    },

    { t: "h1", text: "12. Ändringar av avtalet" },
    {
      t: "p",
      text: "Ändringar och tillägg till detta avtal ska vara skriftliga och undertecknade av behöriga företrädare för båda parter för att vara giltiga. Leverantören förbehåller sig rätten att uppdatera allmänna villkor med 60 dagars skriftligt förvarning. Om Kunden inte accepterar förändringarna äger Kunden rätt att säga upp avtalet med 30 dagars varsel.",
    },

    { t: "h1", text: "13. Tvistelösning och tillämplig lag" },
    { t: "h2", text: "13.1 Tillämplig lag" },
    {
      t: "p",
      text: "Detta avtal ska tolkas och tillämpas i enlighet med svensk lag, utan tillämpning av dess lagvalsregler.",
    },
    { t: "h2", text: "13.2 Tvister" },
    {
      t: "p",
      text: "Tvister som uppstår i samband med detta avtal ska i första hand lösas genom förhandling mellan parterna. Om parterna inte kan enas inom 30 dagar ska tvisten avgöras av allmän domstol i Sverige, med Göteborgs tingsrätt som första instans.",
    },
    {
      t: "callout",
      kind: "info",
      text: "Alternativ: Överväg skiljedomsklausul (SCC – Stockholms Handelskammares Skiljedomsinstitut) om ni arbetar med större kunder. Det är snabbare och mer konfidentiellt än allmän domstol, men dyrare.",
    },

    { t: "h1", text: "Underskrifter" },
    {
      t: "p",
      text: "Parterna har undertecknat detta avtal i två likalydande exemplar.",
    },
    { t: "space", h: 10 },
    {
      t: "signatures",
      left: `För Leverantören (${company.name})`,
      right: `För Kunden (${x.customerName})`,
    },
  ];
}

// ---------------------------------------------------------------------------
// PUB-avtal innehåll
// ---------------------------------------------------------------------------

function pubBlocks(x: Ctx, company: CompanyInfo): Block[] {
  const saasRef = x.offerNumber
    ? `Ingår som Bilaga 2 i SaaS-avtal (offert ${x.offerNumber}) daterat ${x.offerDate}`
    : `Ingår som Bilaga 2 i SaaS-avtal daterat ${x.offerDate}`;
  return [
    {
      t: "callout",
      kind: "info",
      text: "Detta PUB-avtal uppfyller kraven i GDPR Artikel 28. Fält [INOM HAKPARENTES] ska fyllas i av parterna. Detta avtal är ett bindande juridiskt dokument.",
    },
    {
      t: "meta",
      rows: [
        [
          "Personuppgiftsansvarig (PUA):",
          `${x.customerName}, org.nr ${x.customerOrg}`,
        ],
        [
          "Personuppgiftsbiträde (PUB):",
          `${company.name}, org.nr ${company.orgNumber || "[ORG.NR]"}`,
        ],
        ["Avtalsdatum:", x.offerDate],
        ["Relaterat SaaS-avtal:", saasRef],
      ],
    },

    { t: "h1", text: "1. Bakgrund och syfte" },
    {
      t: "p",
      text: "Detta Personuppgiftsbiträdesavtal reglerar Personuppgiftsbiträdets (Leverantörens) behandling av personuppgifter på uppdrag av den Personuppgiftsansvarige (Kunden) i samband med tillhandahållandet av Tjänsten som beskrivs i SaaS-avtalet.",
    },
    {
      t: "p",
      text: "Avtalet syftar till att säkerställa att behandlingen sker i enlighet med GDPR (EU) 2016/679 och tillhörande svensk dataskyddslagstiftning.",
    },

    { t: "h1", text: "2. Definitioner" },
    {
      t: "bullets",
      items: [
        '"Personuppgiftsansvarig" avser den part som ensam eller tillsammans med andra bestämmer ändamål och medel för behandlingen av personuppgifter – i detta fall Kunden.',
        '"Personuppgiftsbiträde" avser den part som behandlar personuppgifter för den personuppgiftsansvariges räkning – i detta fall Leverantören.',
        '"Registrerad" avser den fysiska person vars personuppgifter behandlas.',
        '"Personuppgiftsincident" avser en säkerhetsincident som leder till oavsiktlig eller olaglig förstöring, förlust, ändring, obehörigt röjande av eller obehörig åtkomst till överförda, lagrade eller på annat sätt behandlade personuppgifter.',
        '"Tredjeland" avser land utanför EU/EES.',
      ],
    },

    { t: "h1", text: "3. Behandlingens karaktär, ändamål och varaktighet" },
    { t: "h2", text: "3.1 Ändamål med behandlingen" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet behandlar personuppgifter uteslutande för att tillhandahålla Tjänsten enligt SaaS-avtalet, nämligen: [BESKRIV ÄNDAMÅLET SPECIFIKT, t.ex. 'hantering av kundorders, kundkonton och orderhistorik för klädbutik']",
    },
    { t: "h2", text: "3.2 Kategorier av registrerade" },
    {
      t: "p",
      text: "Behandlingen omfattar personuppgifter tillhörande följande kategorier av registrerade:",
    },
    {
      t: "bullets",
      items: [
        "[ANGE KATEGORI, t.ex. Slutkunder/konsumenter som handlar i Kundens webbutik]",
        "[ANGE KATEGORI vid behov, t.ex. Kundens egna anställda/administratörer]",
      ],
    },
    { t: "h2", text: "3.3 Typer av personuppgifter" },
    { t: "p", text: "Behandlingen avser följande kategorier av personuppgifter:" },
    {
      t: "table",
      headers: ["Kategori", "Fält", "Känsliga uppgifter?"],
      widths: [0.3, 0.5, 0.2],
      rows: [
        ["Kontaktuppgifter", "Namn, e-post, telefonnummer", "Nej"],
        ["Adressuppgifter", "Leveransadress, fakturaadress", "Nej"],
        ["Transaktionsdata", "Orderhistorik, betalningsstatus", "Nej"],
        ["Kontouppgifter", "Användarnamn, lösenord (krypterat)", "Nej"],
        ["[LÄGG TILL FÄLT]", "[BESKRIV]", "[Ja/Nej]"],
      ],
    },
    {
      t: "callout",
      kind: "warn",
      text: "Behandlar ni känsliga personuppgifter (hälsa, etnicitet, religion, politisk åskådning etc.)? Dessa kräver extra skyddsåtgärder och måste anges explicit här. Kontakta jurist om detta är aktuellt.",
    },
    { t: "h2", text: "3.4 Behandlingens varaktighet" },
    {
      t: "p",
      text: "Behandlingen pågår under SaaS-avtalets giltighetstid. Personuppgifter raderas eller anonymiseras senast [30/60/90 dagar – ANGE PERIOD] efter avtalets upphörande, om inte annan lagringstid krävs enligt lag.",
    },

    { t: "h1", text: "4. Personuppgiftsbiträdets skyldigheter" },
    { t: "h2", text: "4.1 Instruktioner" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet får uteslutande behandla personuppgifter i enlighet med dokumenterade instruktioner från den Personuppgiftsansvarige, om inte behandling krävs enligt EU-rätten eller nationell lagstiftning.",
    },
    { t: "h2", text: "4.2 Konfidentialitet" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska säkerställa att personal som är behörig att behandla personuppgifter har åtagit sig att iaktta konfidentialitet eller är föremål för en lagstadgad tystnadsplikt.",
    },
    { t: "h2", text: "4.3 Tekniska och organisatoriska säkerhetsåtgärder" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska vidta lämpliga tekniska och organisatoriska åtgärder för att säkerställa en säkerhetsnivå som är lämplig i förhållande till risken. Åtgärderna ska minst inkludera:",
    },
    {
      t: "bullets",
      items: [
        "Kryptering av personuppgifter under överföring (TLS 1.2 eller senare) och i vila (AES-256 eller likvärdig).",
        "Löpande förmåga att säkerställa konfidentialitet, integritet, tillgänglighet och motståndskraft hos behandlingssystemen.",
        "Tillgångskontroll och behörighetshantering baserat på need-to-know-principen.",
        "Rutiner för regelbunden säkerhetskopiering och återställning av data.",
        "Loggning av åtkomst till personuppgifter.",
        "[LÄGG TILL YTTERLIGARE SPECIFIKA ÅTGÄRDER VID BEHOV]",
      ],
    },
    { t: "h2", text: "4.4 Den registrerades rättigheter" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska, i den mån det är möjligt, bistå den Personuppgiftsansvarige med att uppfylla de registrerades rättigheter (rätt till tillgång, rättelse, radering, dataportabilitet, m.m.) genom lämpliga tekniska och organisatoriska åtgärder.",
    },
    { t: "h2", text: "4.5 Konsekvensbedömning (DPIA)" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska bistå den Personuppgiftsansvarige vid genomförande av konsekvensbedömningar avseende dataskydd (DPIA) och vid förhandssamråd med tillsynsmyndigheten, om sådana blir nödvändiga.",
    },

    { t: "h1", text: "5. Personuppgiftsincidenter" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska utan onödigt dröjsmål – och senast inom 24 timmar – efter att ha fått kännedom om en Personuppgiftsincident underrätta den Personuppgiftsansvarige. Underrättelsen ska minst innehålla:",
    },
    {
      t: "bullets",
      items: [
        "Beskrivning av incidentens karaktär, inklusive, om möjligt, kategorierna av och det ungefärliga antalet registrerade som berörs.",
        "Kontaktuppgifter till dataskyddsombudet eller annan kontaktpunkt för ytterligare information.",
        "En beskrivning av de sannolika konsekvenserna av incidenten.",
        "En beskrivning av de åtgärder som vidtagits eller föreslagits för att hantera incidenten.",
      ],
    },
    {
      t: "p",
      text: "Den Personuppgiftsansvarige ansvarar för att anmäla incidenten till Integritetsskyddsmyndigheten (IMY) inom 72 timmar, om det krävs enligt GDPR artikel 33.",
    },
    {
      t: "callout",
      kind: "info",
      text: "Internt tips: Upprätta en intern incidenthanteringsrutin INNAN ni går live. Det är svårt att hantera en incident utan förberedda mallar och rutiner.",
    },

    { t: "h1", text: "6. Anlitande av underbiträden" },
    { t: "h2", text: "6.1 Godkända underbiträden" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet har den Personuppgiftsansvariges generella godkännande att anlita följande underbiträden:",
    },
    {
      t: "table",
      headers: ["Underbiträde", "Tjänst", "Plats/Land"],
      widths: [0.38, 0.36, 0.26],
      rows: [
        ["[t.ex. Amazon Web Services]", "Hosting/Molntjänster", "[t.ex. EU (Frankfurt)]"],
        ["[t.ex. Mailgun / SendGrid]", "Transaktionsmejl", "[t.ex. EU]"],
        ["[t.ex. Stripe / Klarna]", "Betalningslösning", "[t.ex. EU]"],
        ["[LÄGG TILL UNDERBITRÄDE]", "[BESKRIV TJÄNST]", "[ANGE LAND/REGION]"],
      ],
    },
    { t: "h2", text: "6.2 Ändringar av underbiträden" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ska informera den Personuppgiftsansvarige om eventuella planerade förändringar avseende anlitande av underbiträden, och ge den Personuppgiftsansvarige möjlighet att invända mot sådana förändringar med minst 30 dagars förvarning.",
    },
    { t: "h2", text: "6.3 Ansvar för underbiträden" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet ansvarar för att underbiträden är bundna av samma dataskyddsförpliktelser som anges i detta avtal. Personuppgiftsbiträdet är fullt ansvarigt gentemot den Personuppgiftsansvarige för underbiträdets fullgörande av sina dataskyddsförpliktelser.",
    },

    { t: "h1", text: "7. Överföring till tredjeländer" },
    {
      t: "p",
      text: "Personuppgiftsbiträdet får inte överföra personuppgifter till ett land utanför EU/EES utan att en av följande förutsättningar är uppfylld:",
    },
    {
      t: "bullets",
      items: [
        "Europeiska kommissionen har beslutat att det aktuella landet säkerställer en adekvat skyddsnivå.",
        "Standardavtalsklausuler (SCC) antagna av Europeiska kommissionen har ingåtts.",
        "Den Personuppgiftsansvarige har lämnat sitt uttryckliga skriftliga samtycke till överföringen.",
      ],
    },
    {
      t: "p",
      text: "Aktuell situation: [BESKRIV om data lagras/behandlas utanför EU/EES, t.ex. 'All data lagras inom EU (Frankfurt)' eller 'Vi använder tjänst X i USA med stöd av SCC']",
    },

    { t: "h1", text: "8. Granskningsrätt och revisioner" },
    {
      t: "p",
      text: "Den Personuppgiftsansvarige har rätt att, med minst 30 dagars skriftlig förvarning och högst en (1) gång per kalenderår, granska Personuppgiftsbiträdets efterlevnad av detta avtal. Granskning sker på den Personuppgiftsansvariges bekostnad. Personuppgiftsbiträdet ska tillhandahålla all information som är nödvändig för att påvisa att de skyldigheter som fastställs i detta avtal efterlevs.",
    },

    { t: "h1", text: "9. Avtalstid och radering/återlämnande av data" },
    {
      t: "p",
      text: "Detta PUB-avtal gäller under samma tid som SaaS-avtalet. Vid avtalets upphörande ska Personuppgiftsbiträdet, beroende på den Personuppgiftsansvariges val:",
    },
    {
      t: "bullets",
      items: [
        "Återlämna alla personuppgifter i ett maskinläsbart format (CSV, JSON eller liknande) inom 30 dagar, och därefter radera alla kopior, eller",
        "Radera/förstöra alla personuppgifter och bekräfta detta skriftligen till den Personuppgiftsansvarige inom 30 dagar.",
      ],
    },
    {
      t: "p",
      text: "Undantag gäller för uppgifter som Personuppgiftsbiträdet är skyldig att bevara enligt EU-rätten eller nationell lag.",
    },

    { t: "h1", text: "10. Ansvar och skadestånd" },
    {
      t: "p",
      text: "Ansvarsfördelning och eventuell ansvarsbegränsning enligt SaaS-avtalet gäller även för detta PUB-avtal, med undantag för att ingen part kan begränsa ansvar för böter och administrativa sanktionsavgifter som en part åläggs direkt av Integritetsskyddsmyndigheten (IMY) till följd av partens eget handlande.",
    },
    {
      t: "callout",
      kind: "warn",
      text: "Viktigt: Böter från IMY kan uppgå till 4 % av global årsomsättning eller 20 miljoner euro, det högsta av de två. Dessa kan INTE begränsas i avtalet – de drabbar den part som faktiskt gjort fel.",
    },

    { t: "h1", text: "11. Kontaktpersoner och dataskyddsombud" },
    { t: "h2", text: "Personuppgiftsansvarig (Kunden)" },
    {
      t: "p",
      text: `Namn: ${x.customerContact}\nE-post: ${x.customerEmail}\nTelefon: ${x.customerPhone}\nDPO/Dataskyddsombud: [NAMN ELLER 'Ej utsett']`,
    },
    { t: "h2", text: "Personuppgiftsbiträde (Leverantören)" },
    {
      t: "p",
      text: `Namn: ${company.name}\nE-post: ${company.email}\nTelefon: ${company.phone || "[TELEFONNUMMER]"}\nDPO/Dataskyddsombud: ${company.dpo}`,
    },

    { t: "h1", text: "12. Tillämplig lag och tillsynsmyndighet" },
    {
      t: "p",
      text: "Detta avtal ska tolkas och tillämpas i enlighet med GDPR och svensk dataskyddslagstiftning. Tillsynsmyndighet är Integritetsskyddsmyndigheten (IMY), Box 8114, 104 20 Stockholm, imy.se.",
    },

    { t: "h1", text: "Underskrifter" },
    { t: "space", h: 6 },
    {
      t: "signatures",
      left: "Personuppgiftsansvarig (Kunden)",
      right: "Personuppgiftsbiträde (Leverantören)",
    },
  ];
}

// ---------------------------------------------------------------------------
// Publika generatorer
// ---------------------------------------------------------------------------

async function newDoc(title: string, author: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("Triad Admin");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([A4_W, A4_H]);
  const p = new Pdf(doc, page, font, fontBold, fontItalic);
  return { doc, p };
}

// Offert + SaaS-avtal i en och samma PDF (avtalet placeras efter offerten).
export async function generateOfferWithSaasPdf(
  offer: OfferData,
  company: CompanyInfo,
): Promise<Uint8Array> {
  const { doc, p } = await newDoc(`Offert ${offer.offer_number ?? ""}`.trim(), company.name);
  const logo = await loadLogo(doc);

  drawOfferContent(p, offer, logo, company);

  // SaaS-avtalet börjar på en ny sida.
  p.newPage();
  drawContractCover(p, logo, "SAAS-AVTAL", "Programvarutjänst som molntjänst");
  renderBlocks(p, saasBlocks(buildCtx(offer), company));

  return await doc.save();
}

// PUB-avtal som separat PDF.
export async function generatePubPdf(
  offer: OfferData,
  company: CompanyInfo,
): Promise<Uint8Array> {
  const { doc, p } = await newDoc(
    `PUB-avtal ${offer.offer_number ?? ""}`.trim(),
    company.name,
  );
  const logo = await loadLogo(doc);

  drawContractCover(
    p,
    logo,
    "PERSONUPPGIFTSBITRÄDESAVTAL",
    "Bilaga 2 – GDPR Artikel 28",
  );
  renderBlocks(p, pubBlocks(buildCtx(offer), company));

  return await doc.save();
}

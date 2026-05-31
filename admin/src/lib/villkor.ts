// Villkor-block — matchar Villkor.pages-mallen (13 sektioner).
// Används som "bilaga" efter Avtals-försättet i samma PDF (se agreement-pdf.ts).
//
// Meta-headern på första sidan visar Leverantör/Kund/Avtalsdatum/Avtalsstart
// med de röda platshållarvärdena auto-fyllda. Avsnitt 1–13 motsvarar
// Villkor-PDF:ens innehåll ordagrant.

import { Block, MetaRow } from "./contract-blocks";
import { CompanyInfo, companyAddressLine } from "./company";
import { fmtDateSv } from "./offer-pdf";

export type VillkorCtx = {
  customerName: string;
  customerOrg: string;
  customerAddress: string;
  agreementDate: string; // sv-SE
  startDate: string; // sv-SE
};

export function buildVillkorCtx(
  customer: {
    name?: string | null;
    org_number?: string | null;
    address?: string | null;
  } | null,
  agreementDate: string | null,
  startDate: string | null,
): VillkorCtx {
  return {
    customerName: customer?.name?.trim() || "[KUNDENS FÖRETAGSNAMN]",
    customerOrg: customer?.org_number?.trim() || "[ORG.NR]",
    customerAddress: (customer?.address?.trim() || "[ADRESS]").replace(/\s*\n\s*/g, ", "),
    agreementDate: agreementDate ? fmtDateSv(agreementDate) : "[DATUM]",
    startDate: startDate ? fmtDateSv(startDate) : "[STARTDATUM]",
  };
}

// Bygger en MetaRow där värdet består av segment, där de röda
// platshållarna (företagsnamn, org.nr, adress, datum) ritas i ROSE.
function leverantorRow(company: CompanyInfo): MetaRow {
  return {
    label: "Leverantör:",
    value: "",
    segments: [
      { text: company.name || "[LEVERANTÖRENS FÖRETAGSNAMN]", red: true, bold: true },
      { text: ", org.nr " },
      { text: company.orgNumber || "[ORG.NR]", red: true },
      { text: ", " },
      { text: companyAddressLine(company) || "[ADRESS]", red: true },
    ],
  };
}

function kundRow(x: VillkorCtx): MetaRow {
  return {
    label: "Kund:",
    value: "",
    segments: [
      { text: x.customerName, red: true, bold: true },
      { text: ", org.nr " },
      { text: x.customerOrg, red: true },
      { text: ", " },
      { text: x.customerAddress, red: true },
    ],
  };
}

export function villkorBlocks(x: VillkorCtx, company: CompanyInfo): Block[] {
  return [
    {
      t: "meta",
      rows: [
        leverantorRow(company),
        kundRow(x),
        {
          label: "Avtalsdatum:",
          value: "",
          segments: [{ text: x.agreementDate, red: true, bold: true }],
        },
        {
          label: "Avtalsstart:",
          value: "",
          segments: [{ text: x.startDate, red: true, bold: true }],
        },
      ],
    },

    { t: "h1", text: "1. Definitioner" },
    { t: "p", text: "I detta avtal gäller följande definitioner:" },
    {
      t: "bullets",
      items: [
        '"Tjänsten" avser den lösning som Leverantören tillhandahåller och som beskrivs i (Projektbeskrivning).',
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
      text: "Leverantören tillhandahåller Tjänsten som en molntjänst. Leverantören ansvarar för drift, serverkapacitet, säkerhetskopiering och underhåll av Tjänsten under avtalstiden i enlighet med vad som anges i detta avtal.",
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

    { t: "h1", text: "6. Dataskydd och personuppgifter" },
    {
      t: "p",
      text: "Parterna ska följa tillämplig dataskyddslagstiftning, inklusive EU:s dataskyddsförordning (GDPR, 2016/679). En separat Personuppgiftsbiträdesavtal (PUB-avtal) ska tecknas och utgör en integrerad del av detta avtal. Vid konflikt mellan PUB-avtalet och detta avtal gäller PUB-avtalet avseende behandling av personuppgifter.",
    },

    { t: "h1", text: "7. Sekretess" },
    {
      t: "p",
      text: "Båda parter förbinder sig att inte röja konfidentiell information om den andra parten till tredje part under avtalstiden och under 36 månader därefter. Konfidentiell information får enbart användas för att fullgöra förpliktelserna under detta avtal.",
    },
    { t: "p", text: "Undantag gäller för information som:" },
    {
      t: "p",
      text: "(i) är eller blir allmänt känd utan att den mottagande parten brutit mot sekretessåtagandet;",
    },
    {
      t: "p",
      text: "(ii) var känd för mottagaren redan innan avtalets ingående; eller",
    },
    {
      t: "p",
      text: "(iii) ska röjas enligt lag, domstolsbeslut eller myndighetsbeslut.",
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

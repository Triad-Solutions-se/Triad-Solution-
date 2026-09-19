// Innehåll för PUB-mallen "Webbplats" — webbplats med medlems-/adminfunktioner
// för föreningar och organisationer (första kund: Göteborgs Unga Muslimer).
//
// Bygg docx:en med:  node scripts/build-pub-template.mjs webbplats
// Ladda sedan upp den under Mallar → Avtal → "Ladda upp PUB-mall".
//
// NY MALL FÖR LIKNANDE PROJEKT: kopiera den här filen till
// <namn>.content.mjs, justera avsnitt 3 (ändamål, registrerade, uppgiftstyper),
// 4.3 (säkerhetsåtgärder) och 6.1 (underbiträden), och bygg med
// `node scripts/build-pub-template.mjs <namn>`.
//
// REGLER (styrs av src/lib/docx-parse.ts + src/lib/pub-template.ts):
//  - Text inom [HAKPARENTES] blir röd platshållare. Bara platshållarna i
//    PUB_SUB_RULES fylls i automatiskt, och de är ORDNINGS-beroende:
//    [ORG.NR] #1 = kund, #2 = Triad. [ÅÅÅÅ-MM-DD] #1 = avtalsdatum,
//    #2 = startdatum. [TELEFONNUMMER] #1 = kund, #2 = Triad. Behåll ordningen.
//  - Ett "p"-stycke på formen "Etikett: text" tolkas som meta-rad (grå ruta).
//    Undvik därför kolon följt av text i vanliga stycken; använd { t: "meta" }
//    när rutan är avsiktlig (t.ex. "Anmärkning:").
//  - Rubriken "Underskrifter" + { t: "signatures" } ger signaturfält i PDF:en.

export const meta = {
  fileName: "PUB-Avtal-webbplats.docx",
  // Visas i Word-dokumentets sidhuvud (parsas inte — PDF:en har egen försättssida).
  headerTitle: "Personuppgiftsbiträdesavtal (PUB) — Webbplats",
  // Förslag på namn/beskrivning vid uppladdning i portalen.
  templateName: "PUB-avtal Webbplats",
  templateDescription:
    "Webbplats med medlemsregister, evenemang, nyhetsbrev och betalningar (föreningar/organisationer).",
};

export const blocks = [
  {
    t: "meta",
    rows: [
      ["Personuppgiftsansvarig (PUA)", "[KUNDENS FÖRETAGSNAMN], org.nr [ORG.NR]"],
      ["Personuppgiftsbiträde (PUB)", "Triad Solutions AB, org.nr [ORG.NR]"],
      ["Avtalsdatum", "[ÅÅÅÅ-MM-DD]"],
      ["Relaterat avtal", "Ingår som bilaga till avtal daterat [ÅÅÅÅ-MM-DD]"],
    ],
  },

  { t: "h1", text: "1. Bakgrund och syfte" },
  {
    t: "p",
    text: "Detta Personuppgiftsbiträdesavtal reglerar Personuppgiftsbiträdets (Leverantörens) behandling av personuppgifter på uppdrag av den Personuppgiftsansvarige (Kunden) i samband med utveckling, drift och förvaltning av Kundens webbplats med tillhörande funktioner (Tjänsten) enligt huvudavtalet.",
  },
  {
    t: "p",
    text: "Avtalet syftar till att säkerställa att behandlingen sker i enlighet med GDPR (EU) 2016/679 och tillhörande svensk dataskyddslagstiftning, samt att uppfylla kravet på skriftligt avtal enligt GDPR art. 28.3.",
  },
  {
    t: "p",
    text: "Kunden är personuppgiftsansvarig och ansvarar för att det finns rättslig grund för behandlingen, för att de registrerade informeras samt för att nödvändiga samtycken inhämtas. Leverantören är personuppgiftsbiträde och behandlar personuppgifterna endast för Kundens räkning.",
  },

  { t: "h1", text: "2. Definitioner" },
  {
    t: "bullets",
    items: [
      "\"Personuppgiftsansvarig\" avser den part som ensam eller tillsammans med andra bestämmer ändamål och medel för behandlingen av personuppgifter – i detta fall Kunden.",
      "\"Personuppgiftsbiträde\" avser den part som behandlar personuppgifter för den personuppgiftsansvariges räkning – i detta fall Leverantören.",
      "\"Registrerad\" avser den fysiska person vars personuppgifter behandlas.",
      "\"Underbiträde\" avser en underleverantör som Personuppgiftsbiträdet anlitar och som behandlar personuppgifter för den Personuppgiftsansvariges räkning.",
      "\"Personuppgiftsincident\" avser en säkerhetsincident som leder till oavsiktlig eller olaglig förstöring, förlust, ändring, obehörigt röjande av eller obehörig åtkomst till överförda, lagrade eller på annat sätt behandlade personuppgifter.",
      "\"Särskilda kategorier av personuppgifter\" avser uppgifter enligt GDPR art. 9, exempelvis uppgifter som avslöjar religiös eller filosofisk övertygelse, politiska åsikter eller medlemskap i fackförening.",
      "\"Tredjeland\" avser land utanför EU/EES.",
    ],
  },

  { t: "h1", text: "3. Behandlingens karaktär, ändamål och varaktighet" },
  { t: "h2", text: "3.1 Ändamål med behandlingen" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet behandlar personuppgifter uteslutande för att tillhandahålla Tjänsten enligt huvudavtalet, nämligen utveckling, drift, underhåll, support och vidareutveckling av Kundens webbplats. I den utsträckning funktionerna ingår i Tjänsten omfattar detta (i) den publika webbplatsen med formulär för kontakt, anmälan och ansökan, (ii) medlemssidor och medlemsregister med inloggning, (iii) hantering av medlemsavgifter och andra betalningar, (iv) evenemang, anmälningar och bemanning av volontärer, (v) utskick av nyhetsbrev, påminnelser och andra meddelanden samt (vi) det administrationsgränssnitt där Kundens behöriga företrädare hanterar innehåll och uppgifter.",
  },
  {
    t: "p",
    text: "Behandlingen består av insamling, lagring, strukturering, läsning, ändring, utlämnande genom överföring till underbiträden, säkerhetskopiering, begränsning och radering. Personuppgiftsbiträdet får inte behandla personuppgifterna för egna ändamål.",
  },
  { t: "h2", text: "3.2 Kategorier av registrerade" },
  { t: "p", text: "Behandlingen omfattar personuppgifter tillhörande följande kategorier av registrerade:" },
  {
    t: "bullets",
    items: [
      "Kundens medlemmar, stödmedlemmar och personer som ansöker om medlemskap.",
      "Minderåriga medlemmar samt deras vårdnadshavare, i den mån Kunden riktar sig till personer under 18 år.",
      "Deltagare och anmälda till Kundens evenemang och aktiviteter.",
      "Volontärer, funktionärer och personer som ansöker till Kundens arbetsgrupper.",
      "Prenumeranter på nyhetsbrev och mottagare av andra utskick.",
      "Kundens styrelse, anställda och administratörer som loggar in i administrationsgränssnittet.",
      "Besökare på webbplatsen och personer som kontaktar Kunden via webbplatsens formulär.",
    ],
  },
  { t: "h2", text: "3.3 Typer av personuppgifter" },
  { t: "p", text: "Behandlingen avser följande kategorier av personuppgifter:" },
  {
    t: "table",
    headers: ["Kategori", "Uppgifter", "Särskild kategori (art. 9)?"],
    rows: [
      ["Identitets- och kontaktuppgifter", "Namn, e-postadress, telefonnummer, stadsdel/ort", "Nej"],
      ["Medlemsuppgifter", "Medlemsnummer, medlemstyp, status, medlemskap per år, födelsedatum/födelseår, kön, grupptillhörighet, utmärkelser", "Kan indirekt förekomma – se avsnitt 3.4"],
      ["Uppgifter om vårdnadshavare", "Vårdnadshavares namn och e-postadress samt tidpunkt för vårdnadshavares samtycke", "Nej"],
      ["Kontouppgifter", "Användarnamn, inloggnings-ID, lösenord (endast hashat), roll och behörigheter", "Nej"],
      ["Betalningsuppgifter", "Belopp, betalsätt, status, period, betalningsreferenser från betaltjänst (Stripe/Swish)", "Nej"],
      ["Evenemang och engagemang", "Anmälningar, arbetspass, närvaro/incheckning, ansökningar med fritext (motivering)", "Kan förekomma i fritext"],
      ["Samtycken och kommunikation", "Samtycke till nyhetsbrev, sms och foto, prenumerationsstatus, utskicks- och leveransstatus, avregistreringar", "Nej"],
      ["Tekniska uppgifter", "IP-adress, enhets- och webbläsarinformation, sessions-ID, server- och åtkomstloggar", "Nej"],
      ["Administrativa noteringar", "Interna anteckningar som Kundens administratörer för in om en medlem (fritext)", "Kan förekomma i fritext"],
    ],
  },
  {
    t: "meta",
    rows: [
      [
        "Anmärkning",
        "Betalkortsnummer och bankuppgifter hanteras aldrig av Leverantörens system. Betalning sker direkt hos betaltjänsten, och Tjänsten lagrar endast referenser och status. Personnummer behandlas inte i Tjänsten.",
      ],
    ],
  },
  { t: "h2", text: "3.4 Särskilda kategorier av personuppgifter och uppgifter om barn" },
  {
    t: "p",
    text: "Om Kundens verksamhet har religiös, politisk, filosofisk eller facklig inriktning kan redan uppgiften om att en person är medlem, deltagare eller prenumerant hos Kunden indirekt avslöja sådana förhållanden som avses i GDPR art. 9. Parterna är överens om att samtliga medlems-, deltagar- och prenumerantuppgifter i sådant fall ska behandlas med den förhöjda skyddsnivå som gäller för särskilda kategorier av personuppgifter.",
  },
  {
    t: "p",
    text: "Kunden ansvarar för att behandlingen har stöd i ett undantag enligt GDPR art. 9.2, exempelvis art. 9.2 d (behandling inom ramen för berättigad verksamhet hos en stiftelse, förening eller annat icke vinstdrivande organ med politiskt, filosofiskt, religiöst eller fackligt syfte) eller den registrerades uttryckliga samtycke. Uppgifterna får inte lämnas ut utanför Kundens organisation utan den registrerades samtycke, och Personuppgiftsbiträdet ska utforma Tjänsten så att sådant utlämnande inte sker.",
  },
  {
    t: "p",
    text: "När Tjänsten riktar sig till personer under 18 år ansvarar Kunden för att fastställa åldersgränser och för att vårdnadshavares samtycke inhämtas där det krävs. Personuppgiftsbiträdet tillhandahåller tekniskt stöd för detta, såsom ålderskontroll vid registrering och dokumentation av vårdnadshavares samtycke.",
  },
  { t: "h2", text: "3.5 Behandlingens varaktighet" },
  {
    t: "p",
    text: "Behandlingen pågår under huvudavtalets giltighetstid. Under avtalstiden gallras uppgifter enligt Kundens instruktioner. Om inget annat instruerats verkställs en registrerads begäran om radering av konto efter 30 dagars ångerfrist, och uppgifter om avslutade medlemskap gallras eller anonymiseras enligt den gallringsrutin som Kunden fastställer. Efter huvudavtalets upphörande hanteras uppgifterna enligt avsnitt 9. Undantag gäller för uppgifter som måste bevaras enligt lag, t.ex. räkenskapsinformation enligt bokföringslagen (7 år).",
  },

  { t: "h1", text: "4. Personuppgiftsbiträdets skyldigheter" },
  { t: "h2", text: "4.1 Instruktioner" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet får uteslutande behandla personuppgifter i enlighet med dokumenterade instruktioner från den Personuppgiftsansvarige, om inte behandling krävs enligt EU-rätten eller nationell lagstiftning. Detta avtal och huvudavtalet utgör Kundens instruktioner vid avtalets ingående. Om Personuppgiftsbiträdet anser att en instruktion strider mot GDPR eller annan dataskyddslagstiftning ska Kunden omedelbart informeras.",
  },
  { t: "h2", text: "4.2 Konfidentialitet" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska säkerställa att personer som är behöriga att behandla personuppgifter har åtagit sig att iaktta konfidentialitet eller omfattas av lagstadgad tystnadsplikt. Åtkomst ges endast till de personer som behöver den för att utföra Tjänsten. Konfidentialiteten gäller även efter att avtalet upphört.",
  },
  { t: "h2", text: "4.3 Tekniska och organisatoriska säkerhetsåtgärder" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska vidta lämpliga tekniska och organisatoriska åtgärder enligt GDPR art. 32 för att säkerställa en säkerhetsnivå som är lämplig i förhållande till risken, med särskild hänsyn till avsnitt 3.4. Åtgärderna ska minst inkludera:",
  },
  {
    t: "bullets",
    items: [
      "Kryptering av personuppgifter under överföring (TLS 1.2 eller senare) och i vila (AES-256 eller likvärdig).",
      "Åtkomstkontroll på databasnivå via Postgres Row-Level Security (RLS), så att en inloggad medlem endast når sina egna uppgifter och administratörer endast når det deras roll medger.",
      "Rollbaserad behörighetsstyrning i administrationsgränssnittet enligt need-to-know-principen, med personliga konton och inbjudan per e-post med tidsbegränsad länk.",
      "Lösenord lagras endast som hash hos autentiseringstjänsten; Leverantören har aldrig tillgång till lösenord i klartext.",
      "Servernycklar och andra hemligheter lagras krypterat i driftmiljön och exponeras aldrig i klientkod eller källkodsförråd.",
      "Betalkorts- och bankuppgifter hanteras aldrig av Tjänsten; betalning sker hos betaltjänsten (Stripe respektive Swish) och webhooks/callbacks verifieras och behandlas idempotent.",
      "Dagliga automatiska säkerhetskopior av databasen samt dokumenterad rutin för återställning.",
      "Loggning av inloggningar och administrativa åtgärder samt server- och åtkomstloggar för felsökning och incidentutredning.",
      "Automatiserad verkställighet av raderingsbegäran och stöd för export av en registrerads uppgifter.",
      "Dataminimering i formulär och register; personnummer samlas inte in.",
      "Avregistreringslänk i varje nyhetsbrev och dokumentation av samtycken (nyhetsbrev, sms, foto, vårdnadshavare).",
      "Separata miljöer för utveckling/test och produktion; produktionsdata används inte i test utan att först anonymiseras.",
      "Beroende-skanning och regelbunden uppdatering av ramverk och kritiska paket.",
      "Tvåfaktorsautentisering på Leverantörens konton hos samtliga underbiträden.",
    ],
  },
  { t: "h2", text: "4.4 Den registrerades rättigheter" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska, genom lämpliga tekniska och organisatoriska åtgärder, bistå den Personuppgiftsansvarige med att uppfylla de registrerades rättigheter (rätt till tillgång, rättelse, radering, begränsning, dataportabilitet och invändning). En begäran som en registrerad riktar direkt till Personuppgiftsbiträdet ska utan dröjsmål vidarebefordras till Kunden och får inte besvaras av Personuppgiftsbiträdet utan Kundens instruktion.",
  },
  { t: "h2", text: "4.5 Konsekvensbedömning (DPIA)" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska bistå den Personuppgiftsansvarige vid genomförande av konsekvensbedömningar avseende dataskydd (DPIA) och vid förhandssamråd med tillsynsmyndigheten, om sådana blir nödvändiga. Parterna noterar att behandling av särskilda kategorier av personuppgifter eller uppgifter om barn kan medföra att Kunden behöver göra en konsekvensbedömning.",
  },
  { t: "h2", text: "4.6 Register över behandling" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska föra ett register över de kategorier av behandling som utförs för Kundens räkning enligt GDPR art. 30.2 och på begäran göra det tillgängligt för Kunden och tillsynsmyndigheten.",
  },

  { t: "h1", text: "5. Personuppgiftsincidenter" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska utan onödigt dröjsmål – och senast inom 24 timmar – efter att ha fått kännedom om en Personuppgiftsincident underrätta den Personuppgiftsansvarige. Underrättelsen ska minst innehålla:",
  },
  {
    t: "bullets",
    items: [
      "Beskrivning av incidentens karaktär, inklusive, om möjligt, kategorierna av och det ungefärliga antalet registrerade och personuppgiftsposter som berörs.",
      "Kontaktuppgifter till den kontaktpunkt där ytterligare information kan erhållas.",
      "En beskrivning av de sannolika konsekvenserna av incidenten.",
      "En beskrivning av de åtgärder som vidtagits eller föreslagits för att hantera incidenten och begränsa dess negativa effekter.",
    ],
  },
  {
    t: "p",
    text: "Om all information inte kan lämnas samtidigt får den lämnas i omgångar. Den Personuppgiftsansvarige ansvarar för att anmäla incidenten till Integritetsskyddsmyndigheten (IMY) inom 72 timmar och för att informera de registrerade, om det krävs enligt GDPR art. 33 och 34. Personuppgiftsbiträdet ska bistå med underlag för detta.",
  },

  { t: "h1", text: "6. Anlitande av underbiträden" },
  { t: "h2", text: "6.1 Godkända underbiträden" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet har den Personuppgiftsansvariges generella godkännande att anlita underbiträden. Vid avtalets ingående anlitas följande underbiträden, i den utsträckning respektive funktion ingår i Tjänsten:",
  },
  {
    t: "table",
    headers: ["Underbiträde", "Tjänst", "Plats för behandling"],
    rows: [
      ["Vercel Inc.", "Hosting av webbplats och administrationsgränssnitt, serverfunktioner, schemalagda jobb, driftloggar", "Serverfunktioner i EU-region; globalt CDN för leverans av sidor"],
      ["Supabase Inc.", "Databas (Postgres), autentisering, fillagring, säkerhetskopior", "EU (Stockholm, eu-north-1, eller Frankfurt, eu-central-1)"],
      ["Resend Inc.", "Utskick av e-post (nyhetsbrev, påminnelser, systemmejl)", "EU/USA – se avsnitt 7"],
      ["Stripe Payments Europe Ltd.", "Kortbetalning och återkommande medlemsavgifter – PCI DSS Level 1", "EU (Irland)"],
    ],
  },
  {
    t: "meta",
    rows: [
      [
        "Anmärkning",
        "Swish-betalningar sker via Kundens eget Swish Handel-avtal med sin bank. Banken och Getswish AB är självständigt personuppgiftsansvariga för betalningen och är inte underbiträden enligt detta avtal. Detsamma gäller Stripe i den del Stripe behandlar uppgifter för egna ändamål, såsom bedrägeribekämpning och regelefterlevnad.",
      ],
    ],
  },
  { t: "h2", text: "6.2 Ändringar av underbiträden" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ska skriftligen informera den Personuppgiftsansvarige om planerade förändringar avseende anlitande eller utbyte av underbiträden med minst 30 dagars förvarning, så att den Personuppgiftsansvarige har möjlighet att invända. Om Kunden invänder på sakliga grunder och parterna inte kan enas om en lösning har Kunden rätt att säga upp den del av Tjänsten som berörs.",
  },
  { t: "h2", text: "6.3 Ansvar för underbiträden" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet ansvarar för att underbiträden genom avtal är bundna av dataskyddsförpliktelser som motsvarar dem som anges i detta avtal. Personuppgiftsbiträdet är fullt ansvarigt gentemot den Personuppgiftsansvarige för underbiträdets fullgörande av sina dataskyddsförpliktelser.",
  },

  { t: "h1", text: "7. Överföring till tredjeländer" },
  {
    t: "p",
    text: "Personuppgiftsbiträdet får inte överföra personuppgifter till ett land utanför EU/EES utan att en av följande förutsättningar är uppfylld:",
  },
  {
    t: "bullets",
    items: [
      "Europeiska kommissionen har beslutat att det aktuella landet eller den aktuella mottagaren säkerställer en adekvat skyddsnivå (t.ex. EU-U.S. Data Privacy Framework för certifierade mottagare).",
      "Standardavtalsklausuler (SCC) antagna av Europeiska kommissionen har ingåtts, vid behov med kompletterande skyddsåtgärder.",
      "Den Personuppgiftsansvarige har lämnat sitt uttryckliga skriftliga samtycke till överföringen.",
    ],
  },
  {
    t: "meta",
    rows: [
      [
        "Aktuell situation",
        "Databas, autentisering, fillagring och säkerhetskopior lagras inom EU/EES. Flera underbiträden är amerikanska bolag eller har amerikanska moderbolag (Vercel, Supabase, Resend), vilket innebär att begränsad behandling kan ske i USA, främst e-postadresser och leveransloggar vid utskick samt supportåtkomst och driftloggar.",
      ],
      [
        "Skyddsåtgärd",
        "Sådan överföring sker med stöd av EU-kommissionens standardavtalsklausuler (SCC) i respektive underbiträdes personuppgiftsbiträdesavtal och, där mottagaren är certifierad, EU-U.S. Data Privacy Framework. Kunden informeras enligt avsnitt 6.2 om förutsättningarna ändras.",
      ],
    ],
  },

  { t: "h1", text: "8. Granskningsrätt och revisioner" },
  {
    t: "p",
    text: "Den Personuppgiftsansvarige har rätt att, med minst 30 dagars skriftlig förvarning och högst en (1) gång per kalenderår, granska Personuppgiftsbiträdets efterlevnad av detta avtal. Vid misstänkt eller inträffad Personuppgiftsincident får granskning ske oftare och med kortare förvarning. Granskning sker på den Personuppgiftsansvariges bekostnad och av Kunden eller en oberoende granskare som är bunden av sekretess. Personuppgiftsbiträdet ska tillhandahålla all information som är nödvändig för att påvisa att skyldigheterna i detta avtal och i GDPR art. 28 efterlevs.",
  },

  { t: "h1", text: "9. Avtalstid och radering / återlämnande av data" },
  {
    t: "p",
    text: "Detta PUB-avtal gäller från undertecknandet och så länge Personuppgiftsbiträdet behandlar personuppgifter för Kundens räkning. Vid huvudavtalets upphörande ska Personuppgiftsbiträdet, beroende på den Personuppgiftsansvariges val:",
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
    text: "Uppgifter i säkerhetskopior raderas i takt med att kopiorna roteras ut, senast 90 dagar efter avtalets upphörande. Undantag gäller för uppgifter som Personuppgiftsbiträdet är skyldigt att bevara enligt EU-rätten eller nationell lag.",
  },

  { t: "h1", text: "10. Ansvar och skadestånd" },
  {
    t: "p",
    text: "Ansvarsfördelning och eventuell ansvarsbegränsning enligt huvudavtalet gäller även för detta PUB-avtal. Skadestånd till registrerade fördelas mellan parterna enligt GDPR art. 82. Ingen part kan begränsa sitt ansvar för administrativa sanktionsavgifter som parten åläggs direkt av Integritetsskyddsmyndigheten (IMY) till följd av partens eget handlande.",
  },

  { t: "h1", text: "11. Kontaktpersoner och dataskyddsombud" },
  { t: "h2", text: "11.1 Personuppgiftsansvarig (Kunden)" },
  {
    t: "meta",
    rows: [
      ["Namn", "[NAMN]"],
      ["Roll", "[ROLL/BEFATTNING]"],
      ["E-post", "[E-POSTADRESS]"],
      ["Telefon", "[TELEFONNUMMER]"],
      ["Dataskyddsombud", "[NAMN eller 'Ej utsett']"],
    ],
  },
  { t: "h2", text: "11.2 Personuppgiftsbiträde (Leverantören)" },
  {
    t: "meta",
    rows: [
      ["Namn", "Rayan Ahmad"],
      ["Roll", "Grundare / Tekniskt ansvarig"],
      ["E-post", "kontakt@triadsolutions.se"],
      ["Telefon", "[TELEFONNUMMER]"],
      ["Dataskyddsombud", "Ej utsett (kärnverksamheten utlöser inte krav enligt GDPR art. 37)"],
    ],
  },
  {
    t: "p",
    text: "Personuppgiftsincidenter och begäranden från registrerade ska anmälas till ovanstående kontaktpersoner. Part ska utan dröjsmål meddela den andra parten om kontaktuppgifterna ändras.",
  },

  { t: "h1", text: "12. Ändringar, tillämplig lag och tillsynsmyndighet" },
  {
    t: "p",
    text: "Ändringar av och tillägg till detta avtal ska vara skriftliga och godkända av båda parter. Vid motstridighet mellan detta avtal och huvudavtalet har detta avtal företräde i frågor som rör behandling av personuppgifter.",
  },
  {
    t: "p",
    text: "Detta avtal ska tolkas och tillämpas i enlighet med GDPR och svensk dataskyddslagstiftning. Tillsynsmyndighet är Integritetsskyddsmyndigheten (IMY), Box 8114, 104 20 Stockholm, imy.se. Tvister avgörs enligt huvudavtalets bestämmelser om tvistlösning.",
  },

  { t: "h1", text: "Underskrifter" },
  {
    t: "signatures",
    left: "Personuppgiftsansvarig (Kunden)",
    right: "Personuppgiftsbiträde (Leverantören)",
  },
];

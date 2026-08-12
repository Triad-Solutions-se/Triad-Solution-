// Extra informations-sektioner för offerter. En offert kan ha valfritt antal
// sektioner (egen rubrik + fritext) som renderas efter projektbeskrivningen.
// Lagras som jsonb-array i offers.custom_sections (migration 0032). Legacy-
// fälten custom_header/custom_text behålls som fallback för offerter sparade
// innan migrationen och speglas från första sektionen vid spara.

export type CustomSection = {
  id: string;
  header: string;
  text: string;
};

// Normalisera en sektion från DB/JSON — fyller defaults så övrig kod slipper
// null-checka varje fält.
export function normalizeSection(raw: any, fallbackId?: string): CustomSection {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : fallbackId ?? cryptoRandomId(),
    header: typeof raw?.header === "string" ? raw.header : "",
    text: typeof raw?.text === "string" ? raw.text : "",
  };
}

export function normalizeSections(raw: unknown): CustomSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => normalizeSection(r, `section-${i}`));
}

// Sektioner för editorn: normaliserad array, med legacy-fälten inlyfta som
// första sektion om arrayen är tom (offert sparad innan migrationen).
export function sectionsOrLegacy(
  raw: unknown,
  legacyHeader?: string | null,
  legacyText?: string | null,
): CustomSection[] {
  const sections = normalizeSections(raw);
  if (sections.length > 0) return sections;
  if ((legacyHeader ?? "").trim() || (legacyText ?? "").trim()) {
    return [
      {
        id: cryptoRandomId(),
        header: legacyHeader ?? "",
        text: legacyText ?? "",
      },
    ];
  }
  return [];
}

// Sektioner redo för render: trimmade och helt tomma bortfiltrerade, med
// fallback till legacy-fälten. Används av PDF- och XLSX-generatorerna.
export function sectionsForRender(
  sections: CustomSection[] | null | undefined,
  legacyHeader?: string | null,
  legacyText?: string | null,
): { header: string; text: string }[] {
  return sectionsOrLegacy(sections ?? [], legacyHeader, legacyText)
    .map((s) => ({ header: s.header.trim(), text: s.text.trim() }))
    .filter((s) => s.header || s.text);
}

function cryptoRandomId(): string {
  // Browser + Node 19+: crypto.randomUUID. I äldre runtimes faller vi tillbaka
  // på Math.random — id:t används bara som React key / lokal referens, inte
  // som DB-PK.
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `section-${Math.random().toString(36).slice(2, 10)}`;
}

export function newEmptySection(): CustomSection {
  return { id: cryptoRandomId(), header: "", text: "" };
}

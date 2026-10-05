// Supermind: hybrid modelluppsättning. Opus gör tung planering/resonemang;
// Haiku gör billig, snabb triage OCH skannar projektens faktiska läge (mycket
// kontext, billiga tokens). Modell-ID:n är konfigurerbara via env.
import Anthropic from "@anthropic-ai/sdk";

// Tung modell för den agentiska planeringsloopen (verktyg, resonemang).
export const PLANNING_MODEL = process.env.SUPERMIND_PLANNING_MODEL || "claude-opus-4-8";

// Snabb, billig modell för triage och enkla svar.
export const FAST_MODEL = process.env.SUPERMIND_FAST_MODEL || "claude-haiku-4-5";

export type Triage = {
  // Behöver frågan portaldata/verktyg (→ Opus-loopen) eller inte (→ direktsvar)?
  needsPortalData: boolean;
  // Färdigt svar från Haiku för triviala turer (hälsning, tack, metafrågor).
  directReply: string;
  tokens: number;
};

const TRIAGE_SYSTEM = `Du är en snabb router för MCA Solutions interna AI-assistent "Supermind".
Assistenten har verktyg för att läsa portaldata: projekt, uppgifter, kunder, offerter,
ekonomi, möten och teamets kapacitet.

Din enda uppgift: avgör om användarens senaste meddelande KRÄVER portaldata/verktyg för att
besvaras väl.

- Sätt needs_portal_data = true för allt som rör projekt, uppgifter, kunder, offerter,
  ekonomi, möten, planering, prioritering eller "vad ska jag göra". Vid minsta tvekan: true.
- Sätt needs_portal_data = false ENDAST för triviala turer som inte rör datan: hälsningar,
  tack, småprat, eller metafrågor om assistenten själv (t.ex. "vilken modell är du?").
  Skriv då ett kort, vänligt svar på svenska i direct_reply.
- När needs_portal_data = true ska direct_reply vara en tom sträng.`;

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    needs_portal_data: {
      type: "boolean",
      description: "True om frågan kräver portaldata/verktyg för ett bra svar.",
    },
    direct_reply: {
      type: "string",
      description: "Kort svar på svenska för triviala turer; tom sträng annars.",
    },
  },
  required: ["needs_portal_data", "direct_reply"],
  additionalProperties: false,
} as const;

/**
 * Klassificerar en inkommande tur med Haiku. Failar säkert: vid fel antar vi
 * att Opus-loopen behövs (needsPortalData = true) så att vi aldrig tappar ett
 * substantiellt svar p.g.a. en triage-miss.
 *
 * OBS: Haiku 4.5 stödjer inte `effort` och behöver ingen `thinking` — vi
 * skickar bara structured outputs (json_schema).
 */
export async function triageMessage(
  client: Anthropic,
  userMessage: string,
): Promise<Triage> {
  try {
    const res = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 512,
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: { type: "json_schema", schema: TRIAGE_SCHEMA as Record<string, unknown> },
      },
    });
    const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    const text = res.content.find((b) => b.type === "text");
    const raw = text && "text" in text ? text.text : "{}";
    const parsed = JSON.parse(raw) as { needs_portal_data?: boolean; direct_reply?: string };
    return {
      needsPortalData: parsed.needs_portal_data !== false, // default: behöver data
      directReply: (parsed.direct_reply ?? "").trim(),
      tokens,
    };
  } catch {
    // Säker fallback: kör Opus-loopen.
    return { needsPortalData: true, directReply: "", tokens: 0 };
  }
}

const SCAN_SYSTEM = `Du analyserar ett mjukvaruprojekts FAKTISKA läge utifrån dess GitHub-repo
(filträd, README, senaste commits) och befintliga uppgifter i portalen.

Sammanfatta kort och faktabaserat på svenska:
1. KLART/BYGGT — funktioner och delar som koden visar redan finns (härled från filer/mappar,
   beroenden, README och commits).
2. PÅGÅR — det som verkar vara under arbete.
3. LUCKOR / NÄSTA STEG — vad som rimligen saknas för att projektet ska bli klart.

Viktigt: lista INTE generiska uppstartssteg (t.ex. "definiera scope", "välj teknik", "sätt
upp repo/CI") om filträdet eller commits visar att de redan är gjorda. Var konkret om vad
som faktiskt finns. Om underlaget är tunt, säg det.`;

/**
 * Skannar ett projekts läge med Haiku (billig, tål mycket kontext). Returnerar
 * en kompakt lägesbild som Opus sedan planerar utifrån. Failar mjukt: vid
 * saknad nyckel eller fel returneras tom sammanfattning så att anroparen kan
 * falla tillbaka på rå kontext.
 */
export async function summarizeProjectState(
  contextText: string,
): Promise<{ summary: string; tokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { summary: "", tokens: 0 };
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      system: SCAN_SYSTEM,
      messages: [{ role: "user", content: contextText }],
    });
    const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { summary: text, tokens };
  } catch {
    return { summary: "", tokens: 0 };
  }
}

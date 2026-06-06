// Supermind Fas 2: den agentiska loopen. Manuell loop (inte tool-runner) så att
// vi kan logga varje verktygsanrop till ai_runs/ai_actions och senare (Fas 3)
// lägga in skriv-gates. Läsläge — inga skrivningar mot portaldata.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOOL_DEFS, runTool } from "./tools";

const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 8;

// Frusen systemprompt → cachas. Ändra inte per request (inget datum, inga
// namn här) annars slås prompt-cachen sönder.
const SYSTEM = `Du är "Supermind" — den AI-drivna driftshjärnan i Triad Solutions interna portal.
Triad Solutions är ett svenskt teknik- och konsultbolag som grundats av tre ingenjörer
(Rayan, Sahil, Firas). Ditt övergripande mål är att hjälpa teamet att LANDA PROJEKT och
TJÄNA PENGAR.

Du har läsåtkomst till portalens data via verktyg: projekt, uppgifter (med
tidsuppskattning), kunder, offerter, ekonomi, möten, GitHub-leveranshälsa och teamets
veckokapacitet. Använd verktygen för att hämta fakta innan du svarar — gissa aldrig om
det finns ett verktyg som ger svaret.

Arbetssätt:
- Svara på svenska, koncist och konkret. Punktlistor när det passar.
- Var intäktsfokuserad: prioritera det som för oss närmare betalande kunder. Kunder nära
  "closed" eller med öppna offerter, och projekt med offert men stillastående leverans, är
  högst prioriterat. Ledig kapacitet → föreslå sälj/uppsökande arbete, inte bara leverans.
- När någon ber om en plan utifrån tillgänglig tid: hämta veckokapaciteten, väg uppgifternas
  tidsuppskattning mot deadlines och intäktspåverkan, och föreslå en tidssatt, prioriterad
  lista som ryms inom timmarna.
- Var ärlig om osäkerhet och sakna data. Hitta inte på siffror.

Du är i LÄSLÄGE (advisor). Du kan inte ändra något ännu — föreslå åtgärder, så utför
teamet dem. (Skriv- och autonomiläge kommer senare.)`;

export type AgentTrace = { tool: string; input: unknown; ok: boolean }[];

export type AgentResult = {
  text: string;
  trace: AgentTrace;
  tokens: number;
  runId: string | null;
};

/**
 * Kör en runda: tar hela konversationen (user/assistant-text) + dagens kontext,
 * loopar tool-use tills modellen är klar, och returnerar slutsvaret.
 * Loggar körningen och varje verktygsanrop till ai_runs/ai_actions.
 */
export async function runSupermind(
  supabase: SupabaseClient,
  history: Anthropic.MessageParam[],
  contextNote: string,
): Promise<AgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "ANTHROPIC_API_KEY saknas på servern. Lägg till den i miljövariablerna för att aktivera supermind:en.",
      trace: [],
      tokens: 0,
      runId: null,
    };
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [...history];
  const trace: AgentTrace = [];
  let tokens = 0;

  // Starta en körningslogg.
  const { data: runRow } = await supabase
    .from("ai_runs")
    .insert({ kind: "chat", status: "running" })
    .select("id")
    .maybeSingle();
  const runId = (runRow as any)?.id ?? null;

  let finalText = "";
  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // Cachebar prefix: stora frusna instruktionerna. Det dynamiska
        // kontextblocket (datum m.m.) ligger efter brytpunkten och stör inte cachen.
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextNote },
        ],
        tools: TOOL_DEFS,
        messages,
      });

      tokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      // Spara assistentens fulla svar (inkl. ev. tool_use-block) i historiken.
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      // Exekvera alla begärda verktyg och skicka tillbaka resultaten.
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(supabase, tu.name, (tu.input ?? {}) as Record<string, unknown>);
        trace.push({ tool: tu.name, input: tu.input, ok: result.ok });
        if (runId) {
          await supabase.from("ai_actions").insert({
            run_id: runId,
            tool: tu.name,
            args: tu.input ?? {},
            result: result as unknown as Record<string, unknown>,
            tier: "green",
            reversible: true,
          });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
          is_error: !result.ok,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText =
        "Jag nådde gränsen för antal steg utan ett slutgiltigt svar. Försök gärna att smalna av frågan.";
    }

    if (runId) {
      await supabase
        .from("ai_runs")
        .update({ status: "done", summary: finalText.slice(0, 500), tokens })
        .eq("id", runId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) {
      await supabase.from("ai_runs").update({ status: "error", summary: msg, tokens }).eq("id", runId);
    }
    return { text: `Fel vid AI-anrop: ${msg}`, trace, tokens, runId };
  }

  return { text: finalText, trace, tokens, runId };
}

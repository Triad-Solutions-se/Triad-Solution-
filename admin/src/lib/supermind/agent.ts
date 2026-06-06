// Supermind: den agentiska loopen. Manuell loop (inte tool-runner) så att vi kan
// logga varje verktygsanrop till ai_runs/ai_actions och styra skriv-gates.
// Läsläge alltid på; skrivläge (endast uppgifter) styrs av canWrite.
//
// Hybrid modelluppsättning: Haiku triagerar varje tur billigt och svarar direkt
// på triviala turer; Opus kör den tunga planeringsloopen med verktyg.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { READ_TOOL_DEFS, WRITE_TOOL_DEFS, runTool, toolTier } from "./tools";
import { PLANNING_MODEL, FAST_MODEL, triageMessage } from "./models";

const MAX_ITERATIONS = 8;

// Frusen systemprompt → cachas. Ändra inte per request (inget datum, inga
// namn här) annars slås prompt-cachen sönder.
const SYSTEM = `Du är "Supermind" — den AI-drivna driftshjärnan i Triad Solutions interna portal.
Triad Solutions är ett svenskt teknik- och konsultbolag som grundats av tre ingenjörer
(Rayan, Sahil, Firas). Ditt övergripande mål är att hjälpa teamet att LANDA PROJEKT och
TJÄNA PENGAR.

Du har läsåtkomst till portalens data via verktyg: projekt, uppgifter (med
tidsuppskattning), kunder, offerter, ekonomi, möten, GitHub-leveranshälsa och teamet
(varje medlems roll, expertis och veckokapacitet). Använd verktygen för att hämta fakta
innan du svarar — gissa aldrig om det finns ett verktyg som ger svaret.

Arbetssätt:
- Svara på svenska, koncist och konkret. Punktlistor när det passar.
- Var intäktsfokuserad: prioritera det som för oss närmare betalande kunder. Kunder nära
  "closed" eller med öppna offerter, och projekt med offert men stillastående leverans, är
  högst prioriterat. Ledig kapacitet → föreslå sälj/uppsökande arbete, inte bara leverans.
- När du föreslår vem som ska göra en uppgift: använd get_team och matcha uppgiften mot varje
  medlems roll och expertis. Föreslå den person vars kompetens passar bäst, och respektera
  deras lediga kapacitet. Om ingen roll är satt, säg det och föreslå utifrån vad du vet.
- När någon ber om en plan utifrån tillgänglig tid: hämta teamet (roller + kapacitet), väg
  uppgifternas tidsuppskattning mot deadlines och intäktspåverkan, och föreslå en tidssatt,
  prioriterad lista som ryms inom timmarna — med rätt person på rätt uppgift.
- Var ärlig om osäkerhet och sakna data. Hitta inte på siffror.`;

// Lägesspecifika avslut. Konkateneras med SYSTEM → två frusna varianter, var
// och en cachas för sig.
const MODE_READONLY = `
Du är i LÄSLÄGE (advisor). Du kan inte ändra något — föreslå åtgärder, så utför teamet dem.`;

const MODE_WRITE = `
Du har SKRIVLÄGE för UPPGIFTER. Du kan skapa, uppdatera och arkivera uppgifter med
verktygen create_task, update_task och archive_task. Regler:
- Gör bara det användaren faktiskt ber om. Skapa/ändra inte uppgifter oombedd.
- Hämta nödvändiga id:n först (get_team för personer, list_projects för projekt,
  list_tasks för att hitta rätt uppgift) innan du skriver.
- Radera aldrig hårt — arkivera (archive_task) i stället.
- Om en begäran är tvetydig eller skulle ändra många uppgifter (mer än ~5), beskriv kort
  vad du tänker göra och be om bekräftelse först.
- Efter att du skrivit: sammanfatta exakt vad du gjorde (vilka uppgifter, vilka ändringar).
- Allt annat (offerter, kunder, ekonomi) är fortfarande LÄSLÄGE — föreslå, ändra inte.`;

export type AgentTrace = { tool: string; input: unknown; ok: boolean }[];

export type AgentResult = {
  text: string;
  trace: AgentTrace;
  tokens: number;
  model: string;
  runId: string | null;
};

// Sista user-meddelandet (sträng) i historiken — det vi triagerar.
function lastUserText(history: Anthropic.MessageParam[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

/**
 * Kör en runda: triagerar turen med Haiku, svarar direkt om den är trivial,
 * annars kör Opus-loopen med verktyg. Loggar körningen och varje verktygsanrop.
 */
export async function runSupermind(
  supabase: SupabaseClient,
  userId: string,
  history: Anthropic.MessageParam[],
  contextNote: string,
  canWrite: boolean,
): Promise<AgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "ANTHROPIC_API_KEY saknas på servern. Lägg till den i miljövariablerna för att aktivera supermind:en.",
      trace: [],
      tokens: 0,
      model: PLANNING_MODEL,
      runId: null,
    };
  }

  const client = new Anthropic({ apiKey });

  // 1. Snabb triage med Haiku.
  const triage = await triageMessage(client, lastUserText(history));

  // 2. Trivial tur → svara direkt med Haiku-svaret, hoppa över Opus.
  if (!triage.needsPortalData && triage.directReply) {
    const { data: runRow } = await supabase
      .from("ai_runs")
      .insert({ kind: "chat_fast", status: "done", summary: triage.directReply.slice(0, 500), tokens: triage.tokens, created_by: userId })
      .select("id")
      .maybeSingle();
    return {
      text: triage.directReply,
      trace: [],
      tokens: triage.tokens,
      model: FAST_MODEL,
      runId: (runRow as any)?.id ?? null,
    };
  }

  // 3. Substantiell tur → Opus-loopen med verktyg. Skrivläge avgör verktygsuppsättning
  // och systemprompt-variant (två frusna varianter, var och en cachas för sig).
  const tools = canWrite ? [...READ_TOOL_DEFS, ...WRITE_TOOL_DEFS] : READ_TOOL_DEFS;
  const systemText = SYSTEM + (canWrite ? MODE_WRITE : MODE_READONLY);

  const messages: Anthropic.MessageParam[] = [...history];
  const trace: AgentTrace = [];
  let tokens = triage.tokens;

  const { data: runRow } = await supabase
    .from("ai_runs")
    .insert({ kind: "chat", status: "running", created_by: userId })
    .select("id")
    .maybeSingle();
  const runId = (runRow as any)?.id ?? null;

  let finalText = "";
  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: PLANNING_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // Cachebar prefix: stora frusna instruktionerna. Det dynamiska
        // kontextblocket (datum m.m.) ligger efter brytpunkten och stör inte cachen.
        system: [
          { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextNote },
        ],
        tools,
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
        const result = await runTool(
          supabase,
          userId,
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
        );
        trace.push({ tool: tu.name, input: tu.input, ok: result.ok });
        if (runId) {
          await supabase.from("ai_actions").insert({
            run_id: runId,
            tool: tu.name,
            args: tu.input ?? {},
            result: result as unknown as Record<string, unknown>,
            tier: toolTier(tu.name),
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
    return { text: `Fel vid AI-anrop: ${msg}`, trace, tokens, model: PLANNING_MODEL, runId };
  }

  return { text: finalText, trace, tokens, model: PLANNING_MODEL, runId };
}

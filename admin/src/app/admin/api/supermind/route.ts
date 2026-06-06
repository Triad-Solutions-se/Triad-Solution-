// Supermind Fas 2: chatt-endpoint. Tar emot ett meddelande, bygger upp
// konversationen från ai_messages, kör den agentiska loopen och sparar svaret.
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { runSupermind } from "@/lib/supermind/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  let body: { threadId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Tomt meddelande" }, { status: 400 });

  // Hitta eller skapa tråd.
  let threadId = body.threadId ?? null;
  if (!threadId) {
    const { data: thread, error } = await supabase
      .from("ai_threads")
      .insert({ title: message.slice(0, 60), created_by: user.id })
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    threadId = (thread as any)?.id ?? null;
  }
  if (!threadId) return NextResponse.json({ error: "Kunde inte skapa tråd" }, { status: 500 });

  // Bygg historik från tidigare meddelanden (endast user/assistant-text).
  const { data: prior } = await supabase
    .from("ai_messages")
    .select("role,content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const history: Anthropic.MessageParam[] = [];
  for (const m of prior ?? []) {
    const text = (m as any).content?.text;
    if ((m as any).role === "user" || (m as any).role === "assistant") {
      if (typeof text === "string" && text.length) {
        history.push({ role: (m as any).role, content: text });
      }
    }
  }
  history.push({ role: "user", content: message });

  // Dynamisk kontext (ej cachad): dagens datum + vem som frågar.
  const today = new Date().toISOString().slice(0, 10);
  const who = user.email ?? "okänd medlem";
  const contextNote = `Dagens datum: ${today}. Inloggad medlem: ${who}.`;

  const result = await runSupermind(supabase, user.id, history, contextNote);

  // Spara user- och assistant-meddelandet.
  await supabase.from("ai_messages").insert([
    { thread_id: threadId, role: "user", content: { text: message } },
    {
      thread_id: threadId,
      role: "assistant",
      content: { text: result.text, trace: result.trace, tokens: result.tokens, model: result.model },
    },
  ]);
  await supabase.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

  return NextResponse.json({
    threadId,
    text: result.text,
    trace: result.trace,
    tokens: result.tokens,
    model: result.model,
  });
}

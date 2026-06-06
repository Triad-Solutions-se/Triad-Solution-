"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Send, Plus, Loader2, Wrench, User } from "lucide-react";
import { fmtDate } from "@/lib/date";

export type ThreadSummary = { id: string; title: string | null; updated_at: string };

type TraceItem = { tool: string; input: unknown; ok: boolean };
type ChatMessage = { role: "user" | "assistant"; text: string; trace?: TraceItem[] };

const SUGGESTIONS = [
  "Vad ska jag jobba med idag? Jag har 6 timmar.",
  "Vilka kunder riskerar att svalna och vad bör vi göra?",
  "Vilka projekt står stilla men har en offert ute?",
  "Ge mig en intäktsfokuserad plan för veckan.",
];

export function SupermindChat({ initialThreads }: { initialThreads: ThreadSummary[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function openThread(id: string) {
    setThreadId(id);
    setErr(null);
    const { data } = await supabase
      .from("ai_messages")
      .select("role,content")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          role: m.role,
          text: m.content?.text ?? "",
          trace: m.content?.trace,
        })),
    );
  }

  function newChat() {
    setThreadId(null);
    setMessages([]);
    setInput("");
    setErr(null);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setErr(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: content }]);
    setLoading(true);
    try {
      const res = await fetch("/admin/api/supermind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Något gick fel");
      if (!threadId && json.threadId) setThreadId(json.threadId);
      setMessages((m) => [...m, { role: "assistant", text: json.text, trace: json.trace }]);
      router.refresh();
      // Uppdatera trådlistan lokalt så den nya tråden dyker upp.
      if (json.threadId) {
        setThreads((prev) => {
          if (prev.some((t) => t.id === json.threadId)) return prev;
          return [
            { id: json.threadId, title: content.slice(0, 60), updated_at: new Date().toISOString() },
            ...prev,
          ];
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] h-[calc(100vh-13rem)] min-h-[420px]">
      {/* Trådlista */}
      <aside className="glass rounded-card p-3 flex flex-col min-h-0">
        <button
          onClick={newChat}
          className="mb-3 w-full rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <Plus size={14} /> Ny chatt
        </button>
        <div className="overflow-y-auto min-h-0 space-y-1">
          {threads.length === 0 && (
            <p className="text-xs text-[var(--muted)] px-2 py-1">Inga tidigare chattar.</p>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              className={`w-full text-left rounded-btn px-3 py-2 text-xs transition-colors ${
                threadId === t.id
                  ? "bg-white/10 text-white"
                  : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="truncate">{t.title || "Utan titel"}</div>
              <div className="text-[10px] text-[var(--muted)]">{fmtDate(t.updated_at)}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Konversation */}
      <section className="glass rounded-card flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="rounded-full bg-teal-500/15 p-3">
                <Sparkles size={22} className="text-teal-300" />
              </div>
              <div>
                <p className="font-heading font-semibold">Fråga supermind:en</p>
                <p className="text-sm text-[var(--muted)] mt-1 max-w-md">
                  Den känner till projekt, uppgifter, kunder, offerter, ekonomi och teamets
                  kapacitet. Målet: landa projekt och tjäna pengar.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-xs text-left text-[var(--muted)] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} msg={m} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={14} className="animate-spin" /> Supermind tänker…
            </div>
          )}
          {err && <p className="text-sm text-rose-300">{err}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-white/5 p-3 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Fråga om projekt, kunder, planering…"
            className="flex-1 resize-none rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm max-h-32"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white p-2.5 disabled:opacity-50 shrink-0"
            aria-label="Skicka"
          >
            <Send size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}

function Message({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`shrink-0 rounded-full p-1.5 h-7 w-7 flex items-center justify-center ${
          isUser ? "bg-white/10" : "bg-teal-500/15"
        }`}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} className="text-teal-300" />}
      </div>
      <div className={`min-w-0 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        {msg.trace && msg.trace.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {msg.trace.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                  t.ok
                    ? "border-white/10 bg-black/20 text-[var(--muted)]"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                }`}
              >
                <Wrench size={9} />
                {t.tool}
              </span>
            ))}
          </div>
        )}
        <div
          className={`inline-block rounded-card px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed text-left ${
            isUser ? "bg-white/10" : "bg-black/20 border border-white/5"
          }`}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}

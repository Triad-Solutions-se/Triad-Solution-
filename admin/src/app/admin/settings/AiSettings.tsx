"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";

export function AiSettings({ aiEnabled }: { aiEnabled: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [enabled, setEnabled] = useState(aiEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistiskt
    const { error } = await supabase
      .from("company_settings")
      .update({ ai_enabled: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      setEnabled(!next); // rulla tillbaka
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="glass rounded-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-teal-400" />
          <h2 className="font-heading text-lg font-semibold">Supermind</h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/90 font-medium">
              Låt supermind skapa och hantera uppgifter
            </p>
            <p className="text-sm text-[var(--muted)] mt-1">
              När detta är på kan supermind:en <b>skapa, uppdatera och arkivera uppgifter</b> på
              din uppmaning. Allt loggas. Offerter, kunder och ekonomi förblir läsläge. Stäng av
              för att återgå till ren rådgivning (läsläge). Fungerar som nödstopp.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            disabled={saving}
            className={`relative shrink-0 mt-1 h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-teal-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
            {saving && (
              <Loader2
                size={12}
                className="absolute -right-5 top-1.5 animate-spin text-[var(--muted)]"
              />
            )}
          </button>
        </div>

        <div
          className={`rounded-btn border px-3 py-2 text-xs ${
            enabled
              ? "border-teal-400/30 bg-teal-400/5 text-teal-200"
              : "border-white/10 bg-black/20 text-[var(--muted)]"
          }`}
        >
          {enabled
            ? "Skrivläge AKTIVT — supermind kan ändra uppgifter."
            : "Läsläge — supermind föreslår men ändrar inget."}
        </div>
      </div>
    </div>
  );
}

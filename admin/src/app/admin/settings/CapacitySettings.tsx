"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save, Check, Clock } from "lucide-react";

type Member = { id: string; name: string; weekly_hours: number };

export function CapacitySettings({ members }: { members: Member[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Member[]>(members);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setHours(id: string, raw: string) {
    const n = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    setRows((prev) =>
      prev.map((m) => (m.id === id ? { ...m, weekly_hours: Number.isNaN(n) ? 0 : n } : m)),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("member_capacity").upsert(
      rows.map((m) => ({ profile_id: m.id, weekly_hours: m.weekly_hours })),
      { onConflict: "profile_id" },
    );
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const total = rows.reduce((sum, m) => sum + (m.weekly_hours || 0), 0);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="glass rounded-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-teal-400" />
          <h2 className="font-heading text-lg font-semibold">Veckokapacitet</h2>
        </div>
        <p className="text-sm text-[var(--muted)] -mt-2">
          Hur många timmar per vecka var och en kan lägga. Supermind:en använder detta för att
          planera arbete utifrån tillgänglig tid.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Inga medlemmar hittades.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/90">{m.name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={m.weekly_hours === 0 ? "" : String(m.weekly_hours)}
                    onChange={(e) => setHours(m.id, e.target.value)}
                    placeholder="0"
                    className="w-24 rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-right text-white"
                  />
                  <span className="text-xs text-[var(--muted)] w-10">tim/v</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-sm">
              <span className="text-[var(--muted)] uppercase tracking-wider text-xs">
                Totalt teamet
              </span>
              <span className="font-mono text-white pr-[3.25rem]">{total} tim/v</span>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={save}
            disabled={saving || rows.length === 0}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "Sparar…" : saved ? "Sparat" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

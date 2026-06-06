"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save, Check, Users } from "lucide-react";

type Member = {
  id: string;
  name: string;
  weekly_hours: number;
  role: string;
  skills: string;
};

export function CapacitySettings({ members }: { members: Member[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Member[]>(members);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function patch(id: string, fields: Partial<Member>) {
    setRows((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
    setSaved(false);
  }

  function setHours(id: string, raw: string) {
    const n = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    patch(id, { weekly_hours: Number.isNaN(n) ? 0 : n });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("member_capacity").upsert(
      rows.map((m) => ({
        profile_id: m.id,
        weekly_hours: m.weekly_hours,
        role: m.role.trim() || null,
        skills: m.skills.trim() || null,
      })),
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
          <Users size={18} className="text-teal-400" />
          <h2 className="font-heading text-lg font-semibold">Team & roller</h2>
        </div>
        <p className="text-sm text-[var(--muted)] -mt-2">
          Roll, expertis och veckokapacitet per medlem. Supermind:en använder detta för att
          föreslå <b>vem</b> som ska göra <b>vad</b> — och planera utifrån tillgänglig tid.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Inga medlemmar hittades.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((m) => (
              <div key={m.id} className="rounded-card border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white/90">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={m.weekly_hours === 0 ? "" : String(m.weekly_hours)}
                      onChange={(e) => setHours(m.id, e.target.value)}
                      placeholder="0"
                      className="w-20 rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-right text-white"
                    />
                    <span className="text-xs text-[var(--muted)] w-10">tim/v</span>
                  </div>
                </div>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Roll</span>
                  <input
                    type="text"
                    value={m.role}
                    onChange={(e) => patch(m.id, { role: e.target.value })}
                    placeholder="t.ex. Backend & infra"
                    className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Expertis & passande uppgifter
                  </span>
                  <textarea
                    value={m.skills}
                    rows={2}
                    onChange={(e) => patch(m.id, { skills: e.target.value })}
                    placeholder="t.ex. Node/Postgres, API-design, DevOps. Passar för backend, integrationer och driftsättning."
                    className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white resize-y"
                  />
                </label>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-sm">
              <span className="text-[var(--muted)] uppercase tracking-wider text-xs">
                Totalt teamet
              </span>
              <span className="font-mono text-white">{total} tim/v</span>
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

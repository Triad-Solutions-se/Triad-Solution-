"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

const PARTICIPANTS = ["Rayan", "Sahil", "Firas"];
const TYPES = [
  ["internal", "Internt"], ["customer", "Kundmöte"], ["workshop", "Workshop"],
  ["planning", "Planering"], ["follow_up", "Uppföljning"],
];

export function NewMeetingButton() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState("internal");
  const [location, setLocation] = useState("");
  const [agenda, setAgenda] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("meetings").insert({
      name: name.trim(),
      date: date || null,
      type,
      location: location || null,
      agenda: agenda || null,
      participants: parts,
      status: "planned",
    });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setOpen(false); setName(""); setDate(""); setAgenda(""); setLocation(""); setParts([]);
    router.refresh();
  }

  function toggle(p: string) {
    setParts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20">
        <Plus size={16} />
        Nytt möte
      </button>
      {open && (
        <div className="fixed inset-0 bg-[var(--scrim)] grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="font-heading text-lg font-semibold">Nytt möte</h3>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mötesnamn" className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2" />
            <div className="grid grid-cols-2 gap-3">
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm">
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Plats / länk" className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
            <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} placeholder="Agenda" className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">Deltagare</div>
              <div className="flex gap-2">
                {PARTICIPANTS.map((p) => (
                  <button type="button" key={p} onClick={() => toggle(p)} className={`rounded-full border px-3 py-1 text-xs ${parts.includes(p) ? "bg-[var(--triad-teal)]/20 border-[var(--triad-teal)] text-[var(--accent-text)]" : "border-white/10 text-[var(--muted)]"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">Avbryt</button>
              <button type="submit" disabled={saving} className="rounded-btn bg-[var(--triad-teal)] text-fixed-black px-4 py-2 text-sm font-medium disabled:opacity-50">
                {saving ? "Sparar…" : "Spara"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

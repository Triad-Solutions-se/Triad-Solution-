"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewProjectButton({ mode = "project" }: { mode?: "project" | "idea" }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const isIdea = mode === "idea";
  const triggerLabel = isIdea ? "+ Ny idé" : "+ Nytt projekt";
  const heading = isIdea ? "Ny idé" : "Nytt projekt";
  const namePlaceholder = isIdea ? "Idénamn" : "Projektnamn";
  const summaryPlaceholder = isIdea ? "Beskriv idén kort" : "Kort sammanfattning";
  const status = isIdea ? "idea" : "planning";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      summary: summary || null,
      priority,
      status,
    });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setOpen(false); setName(""); setSummary("");
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-btn bg-[var(--triad-teal)] text-black px-4 py-2 text-sm font-medium hover:brightness-110">
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md glass rounded-modal p-6 space-y-4">
            <h3 className="font-heading text-lg font-semibold">{heading}</h3>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2" />
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder={summaryPlaceholder} className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm">
              <option value="low">Låg prioritet</option>
              <option value="medium">Medel</option>
              <option value="high">Hög</option>
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">Avbryt</button>
              <button type="submit" disabled={saving} className="rounded-btn bg-[var(--triad-teal)] text-black px-4 py-2 text-sm font-medium disabled:opacity-50">
                {saving ? "Sparar…" : "Spara"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

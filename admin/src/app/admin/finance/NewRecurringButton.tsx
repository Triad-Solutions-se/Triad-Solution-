"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Repeat } from "lucide-react";
import { Modal } from "@/components/Modal";

type Profile = { id: string; display_name: string | null; email: string | null };

export function NewRecurringButton({ profiles }: { profiles: Profile[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    description: "",
    amount_sek: "",
    category: "",
    assignee_id: "",
    frequency: "monthly",
    next_due_date: "",
    start_date: "",
    end_date: "",
    active: true,
    notes: "",
  });

  function reset() {
    setF({
      description: "",
      amount_sek: "",
      category: "",
      assignee_id: "",
      frequency: "monthly",
      next_due_date: "",
      start_date: "",
      end_date: "",
      active: true,
      notes: "",
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("recurring_payments").insert({
      description: f.description,
      amount_sek: Number(f.amount_sek || 0),
      category: f.category || null,
      assignee_id: f.assignee_id || null,
      frequency: f.frequency,
      next_due_date: f.next_due_date || null,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      active: f.active,
      notes: f.notes || null,
    });
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as any,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
      >
        <Repeat size={16} />
        Återkommande
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
          className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
        >
            <h3 className="font-heading text-lg font-semibold">Ny återkommande betalning</h3>
            <input
              autoFocus
              required
              {...bind("description")}
              placeholder="Beskrivning (t.ex. Hosting Vercel)"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                {...bind("amount_sek")}
                type="number"
                step="0.01"
                placeholder="Belopp (SEK)"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
              <input
                {...bind("category")}
                placeholder="Kategori"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
              <select
                {...bind("assignee_id")}
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="">Tilldela…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ?? p.email ?? p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <select
                {...bind("frequency")}
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="monthly">Månadsvis</option>
                <option value="quarterly">Kvartalsvis</option>
                <option value="yearly">Årsvis</option>
              </select>
              <label className="text-xs text-[var(--muted)]">
                Nästa förfallodag
                <input
                  {...bind("next_due_date")}
                  type="date"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Startdatum
                <input
                  {...bind("start_date")}
                  type="date"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)] col-span-2">
                Slutdatum (valfritt)
                <input
                  {...bind("end_date")}
                  type="date"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={f.active}
                onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
              />
              Aktiv
            </label>
            <textarea
              {...bind("notes")}
              rows={2}
              placeholder="Anteckningar"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? "Sparar…" : "Spara"}
              </button>
            </div>
        </form>
      </Modal>
    </>
  );
}

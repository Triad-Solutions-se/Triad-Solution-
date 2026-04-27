"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

type Profile = { id: string; display_name: string | null; email: string | null };

export function NewPaymentButton({ profiles }: { profiles: Profile[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({
    description: "",
    amount_sek: "",
    category: "",
    assignee_id: "",
    due_date: "",
    status: "pending",
    notes: "",
  });

  function reset() {
    setF({
      description: "",
      amount_sek: "",
      category: "",
      assignee_id: "",
      due_date: "",
      status: "pending",
      notes: "",
    });
    setFile(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    try {
      let invoice_path: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `payments/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        invoice_path = path;
      }
      const { error } = await supabase.from("payments").insert({
        description: f.description,
        amount_sek: Number(f.amount_sek || 0),
        category: f.category || null,
        assignee_id: f.assignee_id || null,
        due_date: f.due_date || null,
        status: f.status,
        notes: f.notes || null,
        invoice_path,
      });
      if (error) throw error;
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte spara betalning");
    } finally {
      setSaving(false);
    }
  }

  function bind<K extends keyof typeof f>(k: K) {
    return { value: f[k], onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })) };
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Plus size={16} />
        Ny betalning
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
          >
            <h3 className="font-heading text-lg font-semibold">Ny betalning</h3>
            <input
              autoFocus
              required
              {...bind("description")}
              placeholder="Beskrivning"
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
              <input
                {...bind("due_date")}
                type="date"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
              <select
                {...bind("status")}
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
              >
                <option value="pending">Väntar</option>
                <option value="paid">Betald</option>
                <option value="overdue">Försenad</option>
              </select>
            </div>
            <label className="block text-xs text-[var(--muted)]">
              Faktura (PDF / bild)
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-white file:mr-3 file:rounded-btn file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/20"
              />
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
        </div>
      )}
    </>
  );
}

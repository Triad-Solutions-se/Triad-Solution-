"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText } from "lucide-react";

export function NewInvoiceButton() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({
    number: "",
    customer_name: "",
    amount_sek: "",
    issued_at: "",
    due_date: "",
    status: "draft",
    notes: "",
  });

  function reset() {
    setF({
      number: "",
      customer_name: "",
      amount_sek: "",
      issued_at: "",
      due_date: "",
      status: "draft",
      notes: "",
    });
    setFile(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.number.trim()) return;
    setSaving(true);
    try {
      let pdf_url: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `invoices/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        pdf_url = path;
      }
      const { error } = await supabase.from("invoices").insert({
        number: f.number,
        customer_name: f.customer_name || null,
        amount_sek: Number(f.amount_sek || 0),
        issued_at: f.issued_at || null,
        due_date: f.due_date || null,
        status: f.status,
        notes: f.notes || null,
        pdf_url,
      });
      if (error) throw error;
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte spara faktura");
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
        className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
      >
        <FileText size={16} />
        Ny faktura
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
            <h3 className="font-heading text-lg font-semibold">Ny faktura</h3>
            <input
              autoFocus
              required
              {...bind("number")}
              placeholder="Fakturanummer"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                {...bind("customer_name")}
                placeholder="Kund"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
              />
              <input
                {...bind("amount_sek")}
                type="number"
                step="0.01"
                placeholder="Belopp (SEK)"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
              <select
                {...bind("status")}
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="draft">Utkast</option>
                <option value="sent">Skickad</option>
                <option value="paid">Betald</option>
                <option value="overdue">Försenad</option>
                <option value="credited">Krediterad</option>
              </select>
              <label className="text-xs text-[var(--muted)]">
                Utfärdad
                <input
                  {...bind("issued_at")}
                  type="date"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Förfaller
                <input
                  {...bind("due_date")}
                  type="date"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block text-xs text-[var(--muted)]">
              PDF (valfritt)
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

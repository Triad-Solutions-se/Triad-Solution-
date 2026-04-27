"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Upload } from "lucide-react";
import { Modal } from "@/components/Modal";

const MONTHS_SV = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December",
];

export function UploadFileButton({
  defaultYear,
  defaultMonth,
  compact = false,
}: {
  defaultYear: number;
  defaultMonth?: number;
  compact?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const now = new Date();
  const [f, setF] = useState({
    year: String(defaultYear ?? now.getFullYear()),
    month: String(defaultMonth ?? now.getMonth() + 1),
    type: "receipt",
    description: "",
    amount_sek: "",
  });

  function reset() {
    setF({
      year: String(defaultYear ?? now.getFullYear()),
      month: String(defaultMonth ?? now.getMonth() + 1),
      type: "receipt",
      description: "",
      amount_sek: "",
    });
    setFiles(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setSaving(true);
    try {
      const year = Number(f.year);
      const month = Number(f.month);
      const rows: any[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${year}/${String(month).padStart(2, "0")}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        rows.push({
          year,
          month,
          type: f.type,
          description: f.description || file.name,
          amount_sek: f.amount_sek ? Number(f.amount_sek) : null,
          file_path: path,
        });
      }
      const { error } = await supabase.from("finance_files").insert(rows);
      if (error) throw error;
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ladda upp filer");
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
        className={
          compact
            ? "w-full rounded-btn border border-dashed border-white/15 hover:border-teal-400/40 hover:bg-white/5 px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-white flex items-center justify-center gap-2"
            : "rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
        }
      >
        <Upload size={compact ? 14 : 16} />
        {compact ? "Ladda upp" : "Ladda upp filer"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
          className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
        >
            <h3 className="font-heading text-lg font-semibold">Ladda upp filer</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[var(--muted)]">
                År
                <input
                  {...bind("year")}
                  type="number"
                  min={2000}
                  max={2100}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Månad
                <select
                  {...bind("month")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  {MONTHS_SV.map((name, i) => (
                    <option key={i} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                Typ
                <select
                  {...bind("type")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="receipt">Kvitto</option>
                  <option value="invoice">Faktura</option>
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                Belopp (SEK, valfritt)
                <input
                  {...bind("amount_sek")}
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <input
              {...bind("description")}
              placeholder="Beskrivning (valfri, används om bara en fil)"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
            <label className="block text-xs text-[var(--muted)]">
              Filer (PDF / bild — välj flera)
              <input
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={(e) => setFiles(e.target.files)}
                className="mt-1 block w-full text-sm text-white file:mr-3 file:rounded-btn file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/20"
              />
            </label>
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
                disabled={saving || !files || files.length === 0}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? "Laddar upp…" : "Ladda upp"}
              </button>
            </div>
        </form>
      </Modal>
    </>
  );
}

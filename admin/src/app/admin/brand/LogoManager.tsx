"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Upload, Download, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";

type Asset = {
  id: string;
  label: string;
  background: "light" | "dark" | "color" | string;
  file_path: string;
  mime_type: string | null;
  preview_url: string | null;
};

const BACKGROUNDS: Record<string, string> = {
  light: "#ffffff",
  dark: "#0a2540",
  color: "#f5f5f7",
};

export function LogoManager({ initial }: { initial: Asset[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [meta, setMeta] = useState({ label: "", background: "light" as Asset["background"] });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`Endast bildfiler tillåts (${file.name})`);
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("brand-assets")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        rows.push({
          label: meta.label || file.name.replace(/\.[^.]+$/, ""),
          background: meta.background,
          file_path: path,
          mime_type: file.type,
        });
      }
      const { error } = await supabase.from("brand_assets").insert(rows);
      if (error) throw error;
      setOpen(false);
      setFiles(null);
      setMeta({ label: "", background: "light" });
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ladda upp");
    } finally {
      setSaving(false);
    }
  }

  async function remove(asset: Asset) {
    if (!confirm(`Ta bort "${asset.label}"?`)) return;
    try {
      const { error: storageErr } = await supabase.storage
        .from("brand-assets")
        .remove([asset.file_path]);
      if (storageErr) throw storageErr;
      const { error } = await supabase.from("brand_assets").delete().eq("id", asset.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ta bort");
    }
  }

  return (
    <section className="glass rounded-card p-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-heading text-xl font-semibold">Logotyper</h2>
        <button
          onClick={() => setOpen(true)}
          className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
        >
          <Upload size={16} />
          Ladda upp logotyp
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/10 p-8 text-center text-sm text-[var(--muted)]">
          Inga logotyper uppladdade än. Tryck på "Ladda upp logotyp" för att börja.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {initial.map((asset) => {
            const bg = BACKGROUNDS[asset.background] ?? "#f5f5f7";
            return (
              <div key={asset.id} className="group">
                <div
                  className="rounded-card aspect-video grid place-items-center overflow-hidden border border-white/10"
                  style={{ background: bg }}
                >
                  {asset.preview_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={asset.preview_url}
                      alt={asset.label}
                      className="max-h-[80%] max-w-[80%] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Förhandsgranskning saknas</span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{asset.label}</div>
                    <div className="text-xs text-[var(--muted)] capitalize">{asset.background}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/admin/finance/files/download?bucket=brand-assets&path=${encodeURIComponent(asset.file_path)}`}
                      title="Ladda ner"
                      className="p-1.5 rounded-btn text-[var(--muted)] hover:text-teal-300 hover:bg-teal-500/10"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => remove(asset)}
                      title="Ta bort"
                      className="p-1.5 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={upload}
          className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
        >
            <h3 className="font-heading text-lg font-semibold">Ladda upp logotyp</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={meta.label}
                onChange={(e) => setMeta((p) => ({ ...p, label: e.target.value }))}
                placeholder="Etikett (valfri)"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
              />
              <label className="text-xs text-[var(--muted)] col-span-2">
                Bakgrund (för förhandsgranskning)
                <select
                  value={meta.background}
                  onChange={(e) =>
                    setMeta((p) => ({ ...p, background: e.target.value as Asset["background"] }))
                  }
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="light">Ljus</option>
                  <option value="dark">Mörk</option>
                  <option value="color">Färg</option>
                </select>
              </label>
            </div>
            <label className="block text-xs text-[var(--muted)]">
              Bildfiler (välj flera)
              <input
                type="file"
                accept="image/*"
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
    </section>
  );
}

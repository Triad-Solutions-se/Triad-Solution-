"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";

export function UploadPubTemplateButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Välj en .docx-fil.");
      return;
    }
    if (!name.trim()) {
      setError("Ange ett namn för mallen.");
      return;
    }
    const isDocx =
      file.name.toLowerCase().endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isDocx) {
      setError("Endast .docx-filer stöds.");
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("description", description);
    const res = await fetch("/admin/api/pub-templates", {
      method: "POST",
      body: fd,
    });
    setSaving(false);
    if (!res.ok) {
      try {
        const body = await res.json();
        setError(body.error ?? `Uppladdning misslyckades (${res.status}).`);
      } catch {
        setError(`Uppladdning misslyckades (${res.status}).`);
      }
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn border border-white/10 hover:bg-white/[0.04] text-white px-3 py-2 text-sm flex items-center gap-2 transition-colors"
      >
        <Upload size={14} />
        Ladda upp PUB-mall
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-lg glass rounded-modal p-6 space-y-4"
          >
            <h3 className="font-heading text-lg font-semibold">Ladda upp PUB-mall</h3>
            <p className="text-xs text-[var(--muted)]">
              Ladda upp en .docx-fil. Röda platshållare som{" "}
              <code className="font-mono text-rose-300">[KUNDENS FÖRETAGSNAMN]</code>,{" "}
              <code className="font-mono text-rose-300">[ORG.NR]</code> och{" "}
              <code className="font-mono text-rose-300">[ÅÅÅÅ-MM-DD]</code> fylls
              automatiskt i från offerten och kunden när du skapar ett avtal.
            </p>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Namn *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="t.ex. PUB-avtal e-handel"
                required
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Beskrivning</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="(valfritt) — kort beskrivning av vilken typ av avtal mallen passar för"
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">.docx-fil *</span>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm file:rounded-btn file:border-0 file:bg-white/10 file:text-white file:px-3 file:py-1 file:mr-3 file:text-xs"
              />
            </label>

            {error && (
              <div className="rounded-btn border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="rounded-btn px-3 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Laddar upp…
                  </>
                ) : (
                  <>
                    <Upload size={14} /> Ladda upp
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

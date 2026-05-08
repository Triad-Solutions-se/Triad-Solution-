"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

export function NewAppButton() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ slug: "", name: "", origin: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = f.slug.trim().toLowerCase();
    const name = f.name.trim();
    if (!slug || !name) return;
    setSaving(true);
    const { error } = await supabase
      .from("analytics_apps")
      .insert({ slug, name, origin: f.origin.trim() || null });
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    setF({ slug: "", name: "", origin: "" });
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Plus size={16} />
        Ny app
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md glass rounded-modal p-6 space-y-3"
          >
            <h3 className="font-heading text-lg font-semibold">Registrera app</h3>
            <p className="text-xs text-[var(--muted)]">
              Slug används av beacon-skriptet i appen. Kort, små bokstäver, t.ex. <code>marketing-site</code>.
            </p>
            <input
              autoFocus
              {...bind("slug")}
              placeholder="slug (ex: marketing-site)"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
            <input
              {...bind("name")}
              placeholder="Visningsnamn"
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
            <input
              {...bind("origin")}
              placeholder="Origin (frivillig, ex: https://triadsolutions.se)"
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

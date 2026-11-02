"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FolderPlus } from "lucide-react";
import { Modal } from "@/components/Modal";

type Category = { id: string; title: string; icon: string | null };

export function NewCategoryButton({
  categories,
  defaultParentId = null,
  variant = "primary",
}: {
  categories: Category[];
  defaultParentId?: string | null;
  variant?: "primary" | "compact";
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("📁");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: title.trim(),
        icon,
        kind: "category",
        parent_id: parentId || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    setTitle("");
    setIcon("📁");
    router.push(`/admin/documents/${data!.id}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "rounded-btn border border-white/10 hover:bg-white/5 text-white px-4 py-2 text-sm font-medium flex items-center gap-2"
            : "rounded-btn border border-white/10 hover:bg-white/5 text-white px-3 py-1.5 text-xs flex items-center gap-1.5"
        }
      >
        <FolderPlus size={variant === "primary" ? 16 : 13} />
        {variant === "primary" ? "Ny kategori" : "Ny underkategori"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={create}
          className="w-full max-w-md glass rounded-modal p-6 space-y-3"
        >
          <h3 className="font-heading text-lg font-semibold">Ny kategori</h3>
          <div className="flex gap-3">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              className="w-14 text-center text-2xl bg-black/30 border border-white/10 rounded-btn"
            />
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kategorins namn"
              className="flex-1 rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </div>
          <label className="block text-xs text-[var(--muted)]">
            Förälder (valfri)
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            >
              <option value="">— Rotnivå —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ?? "📁"} {c.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-btn bg-[var(--triad-teal)] text-fixed-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Skapar…" : "Skapa"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

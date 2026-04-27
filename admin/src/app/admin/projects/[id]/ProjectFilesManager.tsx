"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Upload, Download, Trash2, Image as ImageIcon, FileText, File as FileIcon } from "lucide-react";
import { Modal } from "@/components/Modal";

export type ProjectFile = {
  id: string;
  project_id: string;
  kind: string; // document | logo | other
  label: string | null;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  preview_url?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  document: "Dokument",
  logo: "Logotyper",
  other: "Övrigt",
};

const KIND_ORDER = ["document", "logo", "other"];

export function ProjectFilesManager({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectFile[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [meta, setMeta] = useState({ kind: "document", label: "" });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${projectId}/${meta.kind}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("project-files")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        rows.push({
          project_id: projectId,
          kind: meta.kind,
          label: meta.label || file.name.replace(/\.[^.]+$/, ""),
          file_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }
      const { error } = await supabase.from("project_files").insert(rows);
      if (error) throw error;
      setOpen(false);
      setFiles(null);
      setMeta({ kind: "document", label: "" });
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ladda upp");
    } finally {
      setSaving(false);
    }
  }

  async function remove(file: ProjectFile) {
    if (!confirm(`Ta bort "${file.label ?? file.file_path}"?`)) return;
    try {
      const { error: storageErr } = await supabase.storage
        .from("project-files")
        .remove([file.file_path]);
      if (storageErr) throw storageErr;
      const { error } = await supabase.from("project_files").delete().eq("id", file.id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ta bort");
    }
  }

  const grouped = new Map<string, ProjectFile[]>();
  for (const k of KIND_ORDER) grouped.set(k, []);
  for (const f of initial) {
    const key = grouped.has(f.kind) ? f.kind : "other";
    grouped.get(key)!.push(f);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Upload size={16} />
        Ladda upp filer
      </button>

      {initial.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/10 p-6 text-center text-xs text-[var(--muted)]">
          Inga filer än.
        </div>
      ) : (
        <div className="space-y-4">
          {KIND_ORDER.map((k) => {
            const items = grouped.get(k) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
                  {KIND_LABEL[k]} ({items.length})
                </div>
                <ul className="space-y-2">
                  {items.map((f) => (
                    <FileRow key={f.id} file={f} onRemove={() => remove(f)} />
                  ))}
                </ul>
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
            <h3 className="font-heading text-lg font-semibold">Ladda upp till projektet</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[var(--muted)]">
                Typ
                <select
                  value={meta.kind}
                  onChange={(e) => setMeta((p) => ({ ...p, kind: e.target.value }))}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="document">Dokument</option>
                  <option value="logo">Logotyp</option>
                  <option value="other">Övrigt</option>
                </select>
              </label>
              <input
                value={meta.label}
                onChange={(e) => setMeta((p) => ({ ...p, label: e.target.value }))}
                placeholder="Etikett (valfri)"
                className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm self-end"
              />
            </div>
            <label className="block text-xs text-[var(--muted)]">
              Filer (alla filtyper)
              <input
                type="file"
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
    </div>
  );
}

function FileRow({ file, onRemove }: { file: ProjectFile; onRemove: () => void }) {
  const isImage = file.mime_type?.startsWith("image/") ?? false;
  const Icon = isImage ? ImageIcon : file.mime_type?.includes("pdf") ? FileText : FileIcon;
  const downloadUrl = `/admin/finance/files/download?bucket=project-files&path=${encodeURIComponent(file.file_path)}`;

  return (
    <li className="flex items-center gap-3 rounded-btn bg-black/20 border border-white/5 p-2">
      <div className="h-9 w-9 shrink-0 rounded-btn bg-white/5 grid place-items-center overflow-hidden">
        {isImage && file.preview_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={file.preview_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={16} className="text-[var(--muted)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{file.label ?? file.file_path.split("/").pop()}</div>
        <div className="text-[10px] text-[var(--muted)]">
          {file.size_bytes != null ? prettySize(file.size_bytes) : "—"}
        </div>
      </div>
      <a
        href={downloadUrl}
        title="Ladda ner"
        className="p-1.5 rounded-btn text-[var(--muted)] hover:text-teal-300 hover:bg-teal-500/10 shrink-0"
      >
        <Download size={14} />
      </a>
      <button
        onClick={onRemove}
        title="Ta bort"
        className="p-1.5 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function prettySize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} kB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Power, FileText } from "lucide-react";

type Template = {
  id: string;
  name: string;
  description: string | null;
  file_name: string;
  file_size: number | null;
  is_active: boolean;
  created_at: string;
};

export function PubTemplateRow({ t }: { t: Template }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState<"toggle" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleActive() {
    setBusy("toggle");
    const { error } = await supabase
      .from("pub_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    setBusy(null);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  async function del() {
    setBusy("delete");
    const res = await fetch(`/admin/api/pub-templates/${t.id}`, {
      method: "DELETE",
    });
    setBusy(null);
    setConfirmDelete(false);
    if (!res.ok) {
      try {
        const body = await res.json();
        alert(body.error ?? `Borttagning misslyckades (${res.status}).`);
      } catch {
        alert(`Borttagning misslyckades (${res.status}).`);
      }
      return;
    }
    router.refresh();
  }

  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-teal-300 shrink-0" />
          <span className="font-medium">{t.name}</span>
        </div>
      </td>
      <td className="p-3 text-[var(--muted)] truncate max-w-[280px]">
        {t.description ?? "—"}
      </td>
      <td className="p-3 text-[var(--muted)] font-mono text-xs">
        {t.file_name}
        {t.file_size ? (
          <span className="text-[10px] ml-2 opacity-70">
            {(t.file_size / 1024).toFixed(0)} KB
          </span>
        ) : null}
      </td>
      <td className="p-3 text-[var(--muted)] text-xs">
        {new Date(t.created_at).toLocaleDateString("sv-SE")}
      </td>
      <td className="p-3">
        {t.is_active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 text-emerald-300 px-2 py-0.5 text-[10px] font-medium">
            Aktiv
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 text-[var(--muted)] px-2 py-0.5 text-[10px] font-medium">
            Inaktiv
          </span>
        )}
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={toggleActive}
            disabled={!!busy}
            title={t.is_active ? "Inaktivera" : "Aktivera"}
            className="rounded-btn p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <Power size={14} />
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={del}
                disabled={busy === "delete"}
                className="rounded-btn px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
              >
                {busy === "delete" ? "Raderar…" : "Bekräfta"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={!!busy}
                className="rounded-btn px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/5"
              >
                Avbryt
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={!!busy}
              title="Radera mall"
              className="rounded-btn p-1.5 text-[var(--muted)] hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

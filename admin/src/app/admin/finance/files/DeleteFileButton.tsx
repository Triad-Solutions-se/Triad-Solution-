"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";

export function DeleteFileButton({ id, path }: { id: string; path: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm("Ta bort den här filen?")) return;
    setBusy(true);
    try {
      const { error: storageErr } = await supabase.storage.from("finance").remove([path]);
      if (storageErr) throw storageErr;
      const { error } = await supabase.from("finance_files").delete().eq("id", id);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ta bort filen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Ta bort"
      className="p-1.5 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 shrink-0"
    >
      <Trash2 size={14} />
    </button>
  );
}

"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Paperclip, X } from "lucide-react";

/**
 * Kvitto eller leverantörsfaktura på en bokförd banktransaktion (migration 0041).
 * Reserverade rader byts ut vid varje synk och kan därför inte få en fil.
 */
export function BankReceipt({
  transactionId,
  path,
  booked,
  outgoing,
}: {
  transactionId: string;
  path: string | null;
  booked: boolean;
  outgoing: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function setReceiptPath(receipt_path: string | null) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .update({ receipt_path })
      .eq("id", transactionId)
      .select("id");
    if (error) throw error;
    // RLS släpper bara igenom bokförda rader; noll rader = synken har bytt ut den.
    if (!data?.length) throw new Error("Transaktionen finns inte längre som bokförd. Ladda om sidan.");
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const newPath = `bank/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("finance").upload(newPath, file);
      if (upErr) throw upErr;
      try {
        await setReceiptPath(newPath);
      } catch (err) {
        await supabase.storage.from("finance").remove([newPath]);
        throw err;
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ladda upp kvittot");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!path || !confirm("Ta bort kvittot från transaktionen?")) return;
    setBusy(true);
    try {
      await setReceiptPath(null);
      const { error } = await supabase.storage.from("finance").remove([path]);
      if (error) throw error;
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte ta bort kvittot");
    } finally {
      setBusy(false);
    }
  }

  if (path) {
    const name = path.split("/").pop()?.replace(/^\d+_/, "") ?? "Kvitto";
    return (
      <div className="flex items-center gap-1 max-w-[12rem]">
        <a
          href={`/admin/finance/files/download?path=${encodeURIComponent(path)}`}
          title={name}
          className="text-xs text-teal-400 hover:underline flex items-center gap-1 min-w-0"
        >
          <Paperclip size={12} className="shrink-0" />
          <span className="truncate">{name}</span>
        </a>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Ta bort kvitto"
          aria-label="Ta bort kvitto"
          className="p-1 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 shrink-0"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (!booked) {
    return (
      <span className="text-xs text-[var(--muted)]" title="Kvitto kan bifogas när transaktionen är bokförd">
        —
      </span>
    );
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title="Bifoga kvitto eller faktura (PDF / bild)"
        className={
          outgoing
            ? "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-50 whitespace-nowrap"
            : "inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-white disabled:opacity-50 whitespace-nowrap"
        }
      >
        <Paperclip size={11} />
        {busy ? "Laddar upp…" : outgoing ? "Kvitto saknas" : "Bifoga"}
      </button>
    </>
  );
}

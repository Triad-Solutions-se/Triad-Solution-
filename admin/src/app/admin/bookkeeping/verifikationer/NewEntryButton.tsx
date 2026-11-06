"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { Modal } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { ACC, type Account, type EntryLine, imbalance } from "@/lib/accounting/core";
import { NEW_BUTTON_CLS } from "../../finance/button-styles";
import { LineTable, postJson } from "../parts";

const emptyLines = (): EntryLine[] => [
  { account: ACC.BANK, debit: 0, credit: 0 },
  { account: ACC.OTHER_COSTS, debit: 0, credit: 0 },
];

/** Manuell verifikation: ingående balans, lön, periodisering, bokslutspost m.m. */
export function NewEntryButton({ accounts, defaultDate }: { accounts: Account[]; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<EntryLine[]>(emptyLines);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAmounts = lines.every((l) => Number(l.debit) > 0 || Number(l.credit) > 0);
  const ready = !!date && !!description.trim() && hasAmounts && imbalance(lines) === 0;

  function close() {
    setOpen(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let attachment_path: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        attachment_path = `verifikat/${Date.now()}_${safeName}`;
        const { error: uploadError } = await createClient().storage.from("finance").upload(attachment_path, file);
        if (uploadError) throw uploadError;
      }
      const posted = await postJson<{ id: string }>("/admin/api/accounting/entries", {
        date,
        description,
        lines,
        attachment_path,
      });
      setDescription("");
      setLines(emptyLines());
      setFile(null);
      close();
      router.push(`/admin/bookkeeping/verifikationer/${posted.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={NEW_BUTTON_CLS.small}>
        <Plus size={13} /> Ny verifikation
      </button>
      <Modal open={open} onClose={close}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
          className="glass max-h-[90vh] w-full max-w-2xl space-y-3 overflow-auto rounded-modal p-6"
        >
          <h3 className="font-heading text-lg font-semibold">Ny verifikation</h3>
          <p className="text-xs text-[var(--muted)]">
            För det som inte kommer från banken eller fakturorna: ingående balanser, lön, periodiseringar och bokslutsposter.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <DateInput
              value={date}
              onChange={setDate}
              ariaLabel="Bokföringsdag"
              className="rounded-btn border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <input
              autoFocus
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Text, t.ex. Lön oktober"
              className="rounded-btn border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          <LineTable lines={lines} onChange={setLines} accounts={accounts} editing disabled={busy} />
          <label className="block text-xs text-[var(--muted)]">
            Underlag (PDF / bild)
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-white"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className={NEW_BUTTON_CLS.secondary}>
              Avbryt
            </button>
            <button type="submit" disabled={!ready || busy} className={`${NEW_BUTTON_CLS.primary} disabled:opacity-50`}>
              {busy ? "Bokför…" : "Bokför"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

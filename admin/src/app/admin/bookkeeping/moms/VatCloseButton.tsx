"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { NEW_BUTTON_CLS } from "../../finance/button-styles";
import { postJson } from "../parts";

export function VatCloseButton({
  periodId,
  label,
  box49,
  waiting,
  disabledReason,
}: {
  periodId: string;
  label: string;
  box49: number;
  waiting: number;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    const warning = waiting
      ? `\n\n${waiting} poster från perioden väntar i kön. Godkänner ni dem senare hamnar de i nästa period.`
      : "";
    if (
      !confirm(
        `Bokför momsavslutet för ${label} och lås perioden? Ruta 49 blir ${box49} kr.${warning}\n\nInget skickas till Skatteverket: deklarationen lämnar ni där.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/admin/api/accounting/vat/close", { periodId });
      // Stanna på perioden som just redovisades, annars hoppar sidan till nästa.
      router.replace(`/admin/bookkeeping/moms?period=${periodId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(disabledReason || error) && (
        <span role={error ? "alert" : undefined} className={`text-xs ${error ? "text-rose-300" : "text-[var(--muted)]"}`}>
          {error ?? disabledReason}
        </span>
      )}
      <button
        type="button"
        onClick={close}
        disabled={busy || !!disabledReason}
        className={`${NEW_BUTTON_CLS.small} disabled:opacity-50`}
      >
        <Lock size={13} /> {busy ? "Bokför…" : "Bokför momsavslut och lås"}
      </button>
    </div>
  );
}

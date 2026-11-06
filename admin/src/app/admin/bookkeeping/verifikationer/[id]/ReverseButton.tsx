"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { NEW_BUTTON_CLS } from "../../../finance/button-styles";
import { postJson } from "../../parts";

export function ReverseButton({ entryId, label }: { entryId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reverse() {
    if (
      !confirm(
        `Rätta ${label}? En ny verifikation med omvända rader skapas, och ${label} ligger kvar. Kommer verifikationen från ett underlag läggs det tillbaka i kön.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const posted = await postJson<{ id: string }>(`/admin/api/accounting/entries/${entryId}/reverse`, {});
      router.push(`/admin/bookkeeping/verifikationer/${posted.id}`);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={reverse} disabled={busy} className={`${NEW_BUTTON_CLS.small} disabled:opacity-50`}>
      <Undo2 size={13} /> {busy ? "Rättar…" : "Gör rättelse"}
    </button>
  );
}

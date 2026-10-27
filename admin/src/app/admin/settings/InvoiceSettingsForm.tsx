"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, Check, Receipt, Save } from "lucide-react";
import {
  type InvoiceSettings,
  DEFAULT_LATE_INTEREST,
  bankgiroDigits,
  formatBankgiro,
  isValidBankgiro,
  suggestVatNumber,
} from "@/lib/invoice";

// Leverantörens fakturauppgifter (company_settings, migration 0034). Egen
// sparning så att företagsuppgifterna ovan inte påverkas.
export function InvoiceSettingsForm({
  settings,
  orgNumber,
}: {
  settings: InvoiceSettings;
  orgNumber: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [f, setF] = useState({
    bankgiro: settings.bankgiro,
    vatNumber: settings.vatNumber,
    registeredOffice: settings.registeredOffice,
    fSkatt: settings.fSkatt,
    paymentTermsDays: String(settings.paymentTermsDays),
    lateInterest: settings.lateInterest,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
    setSaved(false);
  }

  const bgDigits = bankgiroDigits(f.bankgiro);
  const bgWarning =
    bgDigits && !isValidBankgiro(f.bankgiro)
      ? bgDigits.length < 7 || bgDigits.length > 8
        ? "Ett bankgironummer har 7 eller 8 siffror."
        : "Kontrollsiffran stämmer inte — dubbelkolla numret."
      : null;
  const vatSuggestion = suggestVatNumber(orgNumber);
  const terms = Math.round(Number(f.paymentTermsDays));
  const termsValid = f.paymentTermsDays.trim() !== "" && Number.isFinite(terms) && terms >= 0 && terms <= 365;

  async function save() {
    if (!termsValid) {
      alert("Betalningsvillkor ska vara 0–365 dagar.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({
        bankgiro: bgDigits ? formatBankgiro(f.bankgiro) : null,
        vat_number: f.vatNumber.replace(/\s+/g, "").toUpperCase() || null,
        registered_office: f.registeredOffice.trim() || null,
        f_skatt: f.fSkatt,
        payment_terms_days: terms,
        late_interest: f.lateInterest.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const incomplete = !bgDigits || !f.vatNumber.trim();

  return (
    <div className="max-w-2xl">
      <div className="glass rounded-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-teal-400" />
          <h2 className="font-heading text-lg font-semibold">Fakturering</h2>
        </div>
        <p className="text-sm text-[var(--muted)] -mt-2">
          Skrivs ut på alla kundfakturor — i betalningsrutan och sidfoten. Bankgiro och momsregistreringsnummer
          krävs för att en faktura ska kunna skickas.
        </p>

        {incomplete && (
          <div className="rounded-btn border border-amber-400/30 bg-amber-400/5 p-3 flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
            <span className="text-amber-200">
              Fyll i bankgironummer och momsregistreringsnummer innan ni skickar fakturor.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Bankgironummer</span>
            <input
              value={f.bankgiro}
              onChange={(e) => set("bankgiro", e.target.value)}
              onBlur={() => isValidBankgiro(f.bankgiro) && set("bankgiro", formatBankgiro(f.bankgiro))}
              placeholder="123-4567"
              inputMode="numeric"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
            />
            {bgWarning && <span className="text-[10px] text-amber-300 mt-1 block">{bgWarning}</span>}
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Momsregistreringsnummer</span>
            <input
              value={f.vatNumber}
              onChange={(e) => set("vatNumber", e.target.value)}
              placeholder="SE556677889901"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
            />
            {vatSuggestion && f.vatNumber.replace(/\s+/g, "").toUpperCase() !== vatSuggestion && (
              <button
                type="button"
                onClick={() => set("vatNumber", vatSuggestion)}
                className="text-[10px] text-teal-300 hover:text-teal-200 mt-1"
              >
                Använd {vatSuggestion} (från org.nr)
              </button>
            )}
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Styrelsens säte (kommun)</span>
            <input
              value={f.registeredOffice}
              onChange={(e) => set("registeredOffice", e.target.value)}
              placeholder="Jönköping"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Betalningsvillkor (dagar)</span>
            <input
              type="number"
              min={0}
              max={365}
              value={f.paymentTermsDays}
              onChange={(e) => set("paymentTermsDays", e.target.value)}
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={f.fSkatt}
            onChange={(e) => set("fSkatt", e.target.checked)}
            className="accent-teal-500"
          />
          Godkänd för F-skatt <span className="text-xs text-[var(--muted)]">(skrivs ut på fakturan)</span>
        </label>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Dröjsmålsränta (valfri text)</span>
          <textarea
            value={f.lateInterest}
            onChange={(e) => set("lateInterest", e.target.value)}
            rows={2}
            placeholder={DEFAULT_LATE_INTEREST}
            className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
          />
        </label>

        <div className="flex justify-end pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "Sparar…" : saved ? "Sparat" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

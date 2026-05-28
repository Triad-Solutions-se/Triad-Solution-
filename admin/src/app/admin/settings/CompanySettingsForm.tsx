"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save, Building2, AlertTriangle, Check } from "lucide-react";

type Settings = {
  name: string;
  org_number: string;
  address: string;
  email: string;
  phone: string;
  dpo: string;
};

export function CompanySettingsForm({ settings }: { settings: Settings }) {
  const supabase = createClient();
  const router = useRouter();
  const [f, setF] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function bind<K extends keyof Settings>(k: K) {
    return {
      value: f[k],
      onChange: (e: any) => {
        setF((p) => ({ ...p, [k]: e.target.value }));
        setSaved(false);
      },
    };
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({
        name: f.name.trim() || "Triad Solutions",
        org_number: f.org_number.trim() || null,
        address: f.address.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        dpo: f.dpo.trim() || "Ej utsett",
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

  const incomplete = !f.org_number.trim() || !f.address.trim() || !f.phone.trim();

  return (
    <div className="max-w-2xl space-y-4">
      <div className="glass rounded-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-teal-400" />
          <h2 className="font-heading text-lg font-semibold">Företagsuppgifter</h2>
        </div>
        <p className="text-sm text-[var(--muted)] -mt-2">
          Dessa uppgifter fylls automatiskt in som <b>Leverantör</b> i SaaS-avtalet,{" "}
          <b>Personuppgiftsbiträde</b> i PUB-avtalet och i offertens FRÅN-block.
        </p>

        {incomplete && (
          <div className="rounded-btn border border-amber-400/30 bg-amber-400/5 p-3 flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
            <span className="text-amber-200">
              Komplettera organisationsnummer, adress och telefon — annars visas platshållare
              i avtalen.
            </span>
          </div>
        )}

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Företagsnamn</span>
          <input
            {...bind("name")}
            placeholder="Triad Solutions"
            className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Organisationsnummer</span>
            <input
              {...bind("org_number")}
              placeholder="556677-8899"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Telefon</span>
            <input
              {...bind("phone")}
              placeholder="031-123 45 67"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Adress (gata, postnr, ort)</span>
          <textarea
            {...bind("address")}
            rows={2}
            placeholder="Storgatan 1, 411 01 Göteborg"
            className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">E-post</span>
            <input
              {...bind("email")}
              type="email"
              placeholder="info@triadsolutions.se"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Dataskyddsombud (DPO)</span>
            <input
              {...bind("dpo")}
              placeholder="Ej utsett"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>
        </div>

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

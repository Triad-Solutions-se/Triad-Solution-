"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

type Customer = { id: string; name: string };

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function NewOfferButton({ customers }: { customers: Customer[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    customer_id: "",
    title: "",
    reference: "",
    offer_date: todayISO(),
    valid_until: plusDaysISO(30),
    project_description: "",
    project_price: "0",
    monthly_price: "0",
    project_discount_pct: "0",
    monthly_discount_pct: "0",
    other_costs: "",
    vat_rate: "25",
    currency: "SEK",
    status: "draft",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.customer_id) {
      alert("Välj en kund.");
      return;
    }
    setSaving(true);

    const payload = {
      customer_id: f.customer_id,
      title: f.title || null,
      reference: f.reference || null,
      offer_date: f.offer_date,
      valid_until: f.valid_until || null,
      project_description: f.project_description || null,
      project_price: Number(f.project_price) || 0,
      monthly_price: Number(f.monthly_price) || 0,
      project_discount_pct: clampPct(Number(f.project_discount_pct) || 0),
      monthly_discount_pct: clampPct(Number(f.monthly_discount_pct) || 0),
      other_costs: f.other_costs || null,
      vat_rate: Number(f.vat_rate) || 25,
      currency: f.currency,
      status: f.status,
    };

    const { data, error } = await supabase
      .from("offers")
      .insert(payload)
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    router.push(`/admin/templates/offerter/${data.id}`);
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as string,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  const projectPrice = Number(f.project_price) || 0;
  const monthlyPrice = Number(f.monthly_price) || 0;
  const projDisc = clampPct(Number(f.project_discount_pct) || 0);
  const monthDisc = clampPct(Number(f.monthly_discount_pct) || 0);
  const vat = Number(f.vat_rate) || 0;
  const projAfterDisc = projectPrice * (1 - projDisc / 100);
  const monthAfterDisc = monthlyPrice * (1 - monthDisc / 100);
  const projTotal = projAfterDisc * (1 + vat / 100);
  const monthlyTotal = monthAfterDisc * (1 + vat / 100);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Plus size={16} />
        Ny offert
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-2xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
          >
            <h3 className="font-heading text-lg font-semibold">Ny offert</h3>

            {/* Kund + ref */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Kund *</span>
                <select
                  {...bind("customer_id")}
                  required
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                >
                  <option value="">— Välj kund —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <span className="text-[10px] text-amber-300 mt-1 block">
                    Inga kunder hittades. Skapa en kund först under Kunder.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Er referens (kontaktperson)</span>
                <input
                  {...bind("reference")}
                  placeholder="t.ex. Anna Andersson"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Titel */}
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Titel / Projektnamn</span>
              <input
                {...bind("title")}
                placeholder="t.ex. CRM-system, fas 1"
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
            </label>

            {/* Datum */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Offertdatum</span>
                <input
                  type="date"
                  {...bind("offer_date")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Giltig till</span>
                <input
                  type="date"
                  {...bind("valid_until")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Projektbeskrivning */}
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Projektbeskrivning</span>
              <textarea
                {...bind("project_description")}
                rows={3}
                placeholder="Vad ska lösningen göra? Vad ingår?"
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
              />
            </label>

            {/* Priser */}
            <div className="border-t border-white/5 pt-3 space-y-3">
              <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                Priser (exkl. moms)
              </div>

              {/* Engångskostnad + rabatt */}
              <div className="rounded-btn border border-white/5 p-3 space-y-2 bg-black/20">
                <div className="text-xs font-semibold text-white/70">Engångskostnad</div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-[var(--muted)]">À-pris</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      {...bind("project_price")}
                      className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[var(--muted)]">Rabatt %</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      {...bind("project_discount_pct")}
                      className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
              </div>

              {/* Månad + rabatt */}
              <div className="rounded-btn border border-teal-400/20 p-3 space-y-2 bg-teal-400/5">
                <div className="text-xs font-semibold text-teal-200">Underhåll per månad</div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-[var(--muted)]">À-pris/mån</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      {...bind("monthly_price")}
                      className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[var(--muted)]">Rabatt %</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      {...bind("monthly_discount_pct")}
                      className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
              </div>

              {/* Moms + valuta */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Moms %</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    {...bind("vat_rate")}
                    className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Valuta</span>
                  <select
                    {...bind("currency")}
                    className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  >
                    <option value="SEK">SEK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>

              {/* Live-preview total */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-btn bg-black/20 border border-white/5 p-3">
                  <div className="text-[var(--muted)] mb-1">Engångskostnad (inkl. moms)</div>
                  <div className="font-mono font-semibold text-base">
                    {fmt(projTotal)} {f.currency}
                  </div>
                  {projDisc > 0 && (
                    <div className="text-[10px] text-rose-300 mt-0.5">
                      −{projDisc}% rabatt applicerad
                    </div>
                  )}
                </div>
                <div className="rounded-btn bg-teal-400/10 border border-teal-400/20 p-3">
                  <div className="text-teal-200 mb-1">Per månad (inkl. moms)</div>
                  <div className="font-mono font-semibold text-base text-teal-100">
                    {fmt(monthlyTotal)} {f.currency}
                  </div>
                  {monthDisc > 0 && (
                    <div className="text-[10px] text-rose-300 mt-0.5">
                      −{monthDisc}% rabatt applicerad
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Övriga kostnader */}
            <label className="block">
              <span className="text-xs text-[var(--muted)]">
                Övriga kostnader{" "}
                <span className="text-[10px] normal-case font-normal">
                  (rörliga, ingår ej i totalsumman)
                </span>
              </span>
              <textarea
                {...bind("other_costs")}
                rows={3}
                placeholder={`Ex:\nRoyalty: 5 % av kundens omsättning\nArvode per beställning: 50 SEK/order`}
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono resize-y"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? "Skapar…" : "Skapa offert"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

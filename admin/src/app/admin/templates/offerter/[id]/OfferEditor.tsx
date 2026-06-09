"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/Chip";
import { FileText, Save, Trash2, AlertTriangle, Plus, X } from "lucide-react";
import {
  type OfferItem,
  computeSectionTotals,
  itemsOrFallback,
  newEmptyItem,
  normalizeItems,
} from "@/lib/offer-items";

type Customer = { id: string; name: string; org_number?: string | null; address?: string | null };

type Offer = {
  id: string;
  offer_number: string | null;
  title: string | null;
  customer_id: string | null;
  reference: string | null;
  status: string;
  offer_date: string;
  valid_until: string | null;
  project_description: string | null;
  custom_header: string | null;
  custom_text: string | null;
  project_price: number;
  monthly_price: number;
  project_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
  project_items?: unknown;
  monthly_items?: unknown;
  other_costs?: string | null;
  vat_rate: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: { id: string; name: string; contact_person?: string | null; email?: string | null; phone?: string | null; website?: string | null; org_number?: string | null; address?: string | null } | null;
};

const STATUSES = [
  { value: "draft", label: "Utkast", tone: "gray" },
  { value: "sent", label: "Skickad", tone: "blue" },
  { value: "accepted", label: "Accepterad", tone: "green" },
  { value: "rejected", label: "Avslagen", tone: "red" },
  { value: "expired", label: "Utgången", tone: "orange" },
] as const;

export function OfferEditor({
  offer,
  customers,
}: {
  offer: Offer;
  customers: Customer[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [f, setF] = useState({
    customer_id: offer.customer_id ?? "",
    title: offer.title ?? "",
    reference: offer.reference ?? "",
    offer_date: offer.offer_date,
    valid_until: offer.valid_until ?? "",
    project_description: offer.project_description ?? "",
    custom_header: offer.custom_header ?? "",
    custom_text: offer.custom_text ?? "",
    other_costs: offer.other_costs ?? "",
    vat_rate: String(offer.vat_rate ?? 25),
    currency: offer.currency ?? "SEK",
    status: offer.status,
    notes: offer.notes ?? "",
  });

  // Items är egen state — komplexare än textfält, så vi håller dem separat.
  // Faller tillbaka till legacy-priset första gången editorn öppnas på en
  // gammal offert (om backfill-migrationen inte körts).
  const [projectItems, setProjectItems] = useState<OfferItem[]>(() =>
    itemsOrFallback(
      normalizeItems(offer.project_items),
      Number(offer.project_price ?? 0),
      Number(offer.project_discount_pct ?? 0),
      "Projektkostnad (engångsavgift)",
    ),
  );
  const [monthlyItems, setMonthlyItems] = useState<OfferItem[]>(() =>
    itemsOrFallback(
      normalizeItems(offer.monthly_items),
      Number(offer.monthly_price ?? 0),
      Number(offer.monthly_discount_pct ?? 0),
      "Underhållsavgift (per månad)",
    ),
  );

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const vat = Number(f.vat_rate) || 0;
  const projTotals = useMemo(() => computeSectionTotals(projectItems, vat), [projectItems, vat]);
  const monthTotals = useMemo(() => computeSectionTotals(monthlyItems, vat), [monthlyItems, vat]);

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as string,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  async function save() {
    setSaving(true);
    // project_price / monthly_price speglar sektionens delsumma (före rabatt)
    // så listvyn fortfarande har en meningsfull siffra utan att läsa items.
    // Sektionens discount_pct nollställs — rabatten är nu per rad.
    const payload = {
      customer_id: f.customer_id || null,
      title: f.title || null,
      reference: f.reference || null,
      offer_date: f.offer_date,
      valid_until: f.valid_until || null,
      project_description: f.project_description || null,
      custom_header: f.custom_header || null,
      custom_text: f.custom_text || null,
      project_price: projTotals.subtotal,
      monthly_price: monthTotals.subtotal,
      project_discount_pct: 0,
      monthly_discount_pct: 0,
      project_items: projectItems,
      monthly_items: monthlyItems,
      other_costs: f.other_costs || null,
      vat_rate: Number(f.vat_rate) || 25,
      currency: f.currency,
      status: f.status,
      notes: f.notes || null,
    };
    const { error } = await supabase.from("offers").update(payload).eq("id", offer.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function downloadFile(url: string, fallbackName: string) {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `Kunde inte generera PDF (${res.status}).`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON response */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = cd.match(/filename="([^"]+)"/);
    const name = m?.[1] ?? fallbackName;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  }

  async function downloadOffer() {
    setDownloading(true);
    try {
      const ok = await save();
      if (!ok) return;
      await downloadFile(`/admin/api/offers/${offer.id}/pdf`, "Offert.pdf");
    } catch (e: any) {
      alert(e?.message ?? "Export misslyckades.");
    } finally {
      setDownloading(false);
    }
  }

  async function changeStatus(s: string) {
    setF((p) => ({ ...p, status: s }));
    const { error } = await supabase.from("offers").update({ status: s }).eq("id", offer.id);
    if (error) alert(error.message);
    else router.refresh();
  }

  async function remove() {
    const { error } = await supabase.from("offers").delete().eq("id", offer.id);
    if (error) {
      alert(error.message);
      return;
    }
    router.push("/admin/templates/offerter");
    router.refresh();
  }

  const statusInfo = STATUSES.find((s) => s.value === f.status) ?? STATUSES[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[var(--muted)] font-mono">
              Offert #{offer.offer_number ?? "—"}
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight mt-1 truncate">
              {f.title || offer.customer?.name || "Offert"}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <Chip tone={statusInfo.tone as any}>{statusInfo.label}</Chip>
              <span className="text-xs text-[var(--muted)]">
                Skapad {new Date(offer.created_at).toLocaleDateString("sv-SE")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={downloadOffer}
              disabled={downloading}
              title="Laddar ner offerten som PDF"
              className="rounded-btn bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={14} /> {downloading ? "Exporterar…" : "Ladda ner offert"}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Save size={14} /> {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>

        {/* Quick status switcher */}
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => changeStatus(s.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                f.status === s.value
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/10 text-[var(--muted)] hover:text-white hover:bg-white/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vänster kolumn — fält */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass rounded-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Grunddata
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Kund</span>
                <select
                  {...bind("customer_id")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                >
                  <option value="">— Välj kund —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Er referens</span>
                <input
                  {...bind("reference")}
                  placeholder="Kundens kontaktperson"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-[var(--muted)]">Titel / Projektnamn</span>
                <input
                  {...bind("title")}
                  placeholder="t.ex. CRM-system, fas 1"
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
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
          </div>

          <div className="glass rounded-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Projektbeskrivning
            </h2>
            <textarea
              {...bind("project_description")}
              rows={5}
              placeholder="Vad ingår? Vilka problem löser den? 3–6 meningar passar bra."
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
            />
          </div>

          <div className="glass rounded-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Extra information
            </h2>
            <p className="text-xs text-[var(--muted)] -mt-2">
              Valfri sektion med egen rubrik och text — visas direkt efter projektbeskrivningen i offerten. Lämna tom för att dölja.
            </p>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Rubrik</span>
              <input
                {...bind("custom_header")}
                placeholder="t.ex. Om oss, Vår metod, Leveransplan…"
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Text</span>
              <textarea
                {...bind("custom_text")}
                rows={5}
                placeholder="Fritext som visas under rubriken."
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
              />
            </label>
          </div>

          <div className="glass rounded-card p-5 space-y-4">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Priser (exkl. moms)
            </h2>

            <ItemsEditor
              title="Engångskostnad"
              accent="dark"
              items={projectItems}
              onChange={setProjectItems}
              currency={f.currency}
            />

            <ItemsEditor
              title="Underhåll per månad"
              accent="teal"
              items={monthlyItems}
              onChange={setMonthlyItems}
              currency={f.currency}
            />

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
          </div>

          <div className="glass rounded-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Övriga kostnader
            </h2>
            <p className="text-xs text-[var(--muted)] -mt-2">
              Rörliga eller villkorade kostnader som inte ingår i totalsumman — t.ex. royalty, arvode per beställning, setup-avgift. Syns som en egen sektion i offerten.
            </p>
            <textarea
              {...bind("other_costs")}
              rows={4}
              placeholder={`Ex:\nRoyalty: 5 % av kundens omsättning via plattformen\nArvode per beställning: 50 SEK/order\nSupport utöver avtal: 950 SEK/h`}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y font-mono"
            />
          </div>

          <div className="glass rounded-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
              Interna anteckningar
            </h2>
            <textarea
              {...bind("notes")}
              rows={3}
              placeholder="Syns inte i Excel-exporten."
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
            />
          </div>

          {/* Delete */}
          <div className="glass rounded-card p-5 border border-rose-500/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-rose-300 flex items-center gap-2">
                  <AlertTriangle size={14} /> Riskzon
                </h2>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Radering kan inte ångras.
                </p>
              </div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-btn border border-rose-500/30 hover:bg-rose-500/10 text-rose-300 px-3 py-2 text-sm flex items-center gap-2"
                >
                  <Trash2 size={14} /> Radera offert
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-btn px-3 py-2 text-xs text-[var(--muted)]"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={remove}
                    className="rounded-btn bg-rose-500 hover:bg-rose-400 text-white px-3 py-2 text-xs font-semibold"
                  >
                    Bekräfta radering
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Höger kolumn — totals + kundinfo */}
        <div className="space-y-4">
          <div className="glass rounded-card p-5">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
              Engångskostnad
            </h2>
            <div className="space-y-1.5 text-sm">
              <RowLine label="Delsumma" value={fmt(projTotals.subtotal)} unit={f.currency} />
              {projTotals.discount > 0 && (
                <>
                  <RowLine
                    label="Rabatt"
                    value={`−${fmt(projTotals.discount)}`}
                    unit={f.currency}
                    tone="rose"
                  />
                  <RowLine
                    label="Efter rabatt"
                    value={fmt(projTotals.afterDiscount)}
                    unit={f.currency}
                  />
                </>
              )}
              <RowLine label={`Moms (${vat} %)`} value={fmt(projTotals.vat)} unit={f.currency} />
              <div className="border-t border-white/10 pt-1.5 mt-1.5">
                <RowLine
                  label="Totalt inkl. moms"
                  value={fmt(projTotals.total)}
                  unit={f.currency}
                  highlight
                />
              </div>
            </div>
          </div>

          <div className="glass rounded-card p-5 border-teal-400/20">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-teal-300 mb-3">
              Återkommande månadskostnad
            </h2>
            <div className="space-y-1.5 text-sm">
              <RowLine label="Per månad" value={fmt(monthTotals.subtotal)} unit={f.currency} />
              {monthTotals.discount > 0 && (
                <>
                  <RowLine
                    label="Rabatt"
                    value={`−${fmt(monthTotals.discount)}`}
                    unit={f.currency}
                    tone="rose"
                  />
                  <RowLine
                    label="Efter rabatt"
                    value={fmt(monthTotals.afterDiscount)}
                    unit={f.currency}
                  />
                </>
              )}
              <RowLine label={`Moms (${vat} %)`} value={fmt(monthTotals.vat)} unit={f.currency} />
              <div className="border-t border-white/10 pt-1.5 mt-1.5">
                <RowLine
                  label="Per månad inkl. moms"
                  value={fmt(monthTotals.total)}
                  unit={f.currency}
                  highlight
                  tone="teal"
                />
              </div>
              <RowLine
                label="Årskostnad (×12)"
                value={fmt(monthTotals.total * 12)}
                unit={f.currency}
                small
              />
            </div>
          </div>

          {offer.customer && (
            <div className="glass rounded-card p-5">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
                Kunduppgifter
              </h2>
              <div className="text-sm space-y-1">
                <div className="font-semibold">{offer.customer.name}</div>
                {offer.customer.contact_person && (
                  <div className="text-[var(--muted)] text-xs">
                    Att: {offer.customer.contact_person}
                  </div>
                )}
                {offer.customer.email && (
                  <a
                    href={`mailto:${offer.customer.email}`}
                    className="text-xs text-teal-400 hover:underline block"
                  >
                    {offer.customer.email}
                  </a>
                )}
                {offer.customer.phone && (
                  <div className="text-xs text-[var(--muted)]">{offer.customer.phone}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemsEditor({
  title,
  accent,
  items,
  onChange,
  currency,
}: {
  title: string;
  accent: "dark" | "teal";
  items: OfferItem[];
  onChange: (next: OfferItem[]) => void;
  currency: string;
}) {
  const isTeal = accent === "teal";
  const cardCls = isTeal
    ? "rounded-btn border border-teal-400/20 p-3 space-y-3 bg-teal-400/5"
    : "rounded-btn border border-white/5 p-3 space-y-3 bg-black/20";
  const titleCls = isTeal ? "text-xs font-semibold text-teal-200" : "text-xs font-semibold text-white/70";

  function update(idx: number, patch: Partial<OfferItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...items, newEmptyItem()]);
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <div className={titleCls}>{title}</div>
        <button
          type="button"
          onClick={add}
          className="rounded-btn bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-[11px] flex items-center gap-1"
        >
          <Plus size={12} /> Lägg till rad
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-[11px] text-[var(--muted)] italic py-2">
          Inga rader — tryck "Lägg till rad" för att börja.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Kolumnrubriker */}
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)] px-1">
            <div className="col-span-6">Beskrivning</div>
            <div className="col-span-3 text-right">À-pris</div>
            <div className="col-span-2 text-right">Rabatt %</div>
            <div className="col-span-1" />
          </div>

          {items.map((it, idx) => {
            const lineNet = it.unit_price * (1 - clamp(it.discount_pct) / 100);
            return (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-start">
                <input
                  type="text"
                  value={it.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  placeholder="t.ex. Implementation, fas 1"
                  className="col-span-6 rounded-btn bg-black/30 border border-white/10 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={it.unit_price || ""}
                  onChange={(e) => update(idx, { unit_price: Number(e.target.value) || 0 })}
                  className="col-span-3 rounded-btn bg-black/30 border border-white/10 px-2 py-1.5 text-sm font-mono text-right"
                />
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={it.discount_pct || ""}
                  onChange={(e) => update(idx, { discount_pct: clamp(Number(e.target.value) || 0) })}
                  className="col-span-2 rounded-btn bg-black/30 border border-white/10 px-2 py-1.5 text-sm font-mono text-right"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="col-span-1 h-[34px] rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center"
                  title="Ta bort rad"
                >
                  <X size={14} />
                </button>
                {/* Per-rad netto (visas under priset om rabatt finns, så användaren ser effekten) */}
                {it.discount_pct > 0 && (
                  <div className="col-span-12 -mt-1 text-[10px] text-[var(--muted)] text-right font-mono pr-9">
                    Efter rabatt: {fmt(lineNet)} {currency}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function RowLine({
  label,
  value,
  unit,
  highlight,
  small,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
  small?: boolean;
  tone?: "teal" | "rose";
}) {
  const labelTone =
    tone === "rose"
      ? "text-rose-300"
      : tone === "teal" && highlight
      ? "text-teal-200"
      : "";
  const valueTone =
    tone === "rose"
      ? "text-rose-300"
      : tone === "teal" && highlight
      ? "text-teal-100"
      : "";
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`${small ? "text-xs" : "text-sm"} ${
          highlight ? "font-semibold" : "text-[var(--muted)]"
        } ${labelTone}`}
      >
        {label}
      </span>
      <span
        className={`font-mono ${
          highlight ? (small ? "text-sm" : "text-base font-semibold") : "text-sm"
        } ${valueTone}`}
      >
        {value} {unit}
      </span>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/Chip";
import { Download, Save, Trash2, AlertTriangle } from "lucide-react";

type Customer = { id: string; name: string };

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
  project_price: number;
  monthly_price: number;
  vat_rate: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: { id: string; name: string; contact_person?: string | null; email?: string | null; phone?: string | null; website?: string | null } | null;
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
    project_price: String(offer.project_price ?? 0),
    monthly_price: String(offer.monthly_price ?? 0),
    vat_rate: String(offer.vat_rate ?? 25),
    currency: offer.currency ?? "SEK",
    status: offer.status,
    notes: offer.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const projectPrice = Number(f.project_price) || 0;
  const monthlyPrice = Number(f.monthly_price) || 0;
  const vat = Number(f.vat_rate) || 0;

  const totals = useMemo(() => {
    const projVat = projectPrice * (vat / 100);
    const projTotal = projectPrice + projVat;
    const monthVat = monthlyPrice * (vat / 100);
    const monthTotal = monthlyPrice + monthVat;
    return {
      projVat,
      projTotal,
      monthVat,
      monthTotal,
      yearTotal: monthTotal * 12,
    };
  }, [projectPrice, monthlyPrice, vat]);

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as string,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  async function save() {
    setSaving(true);
    const payload = {
      customer_id: f.customer_id || null,
      title: f.title || null,
      reference: f.reference || null,
      offer_date: f.offer_date,
      valid_until: f.valid_until || null,
      project_description: f.project_description || null,
      project_price: Number(f.project_price) || 0,
      monthly_price: Number(f.monthly_price) || 0,
      vat_rate: Number(f.vat_rate) || 25,
      currency: f.currency,
      status: f.status,
      notes: f.notes || null,
    };
    const { error } = await supabase.from("offers").update(payload).eq("id", offer.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
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
            <a
              href={`/admin/api/offers/${offer.id}/export`}
              className="rounded-btn bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-sm flex items-center gap-2 transition-colors"
            >
              <Download size={14} /> Exportera Excel
            </a>
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
              Priser (exkl. moms)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block col-span-2 sm:col-span-1">
                <span className="text-xs text-[var(--muted)]">Engångskostnad</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  {...bind("project_price")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="block col-span-2 sm:col-span-1">
                <span className="text-xs text-[var(--muted)]">Per månad</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  {...bind("monthly_price")}
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                />
              </label>
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
              <RowLine label="Exkl. moms" value={fmt(projectPrice)} unit={f.currency} />
              <RowLine label={`Moms (${vat}%)`} value={fmt(totals.projVat)} unit={f.currency} />
              <div className="border-t border-white/10 pt-1.5 mt-1.5">
                <RowLine
                  label="Totalt inkl. moms"
                  value={fmt(totals.projTotal)}
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
              <RowLine label="Exkl. moms" value={fmt(monthlyPrice)} unit={f.currency} />
              <RowLine label={`Moms (${vat}%)`} value={fmt(totals.monthVat)} unit={f.currency} />
              <div className="border-t border-white/10 pt-1.5 mt-1.5">
                <RowLine
                  label="Per månad inkl. moms"
                  value={fmt(totals.monthTotal)}
                  unit={f.currency}
                  highlight
                  tone="teal"
                />
              </div>
              <RowLine
                label="Årskostnad (×12)"
                value={fmt(totals.yearTotal)}
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
  tone?: "teal";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`${small ? "text-xs" : "text-sm"} ${
          highlight ? "font-semibold" : "text-[var(--muted)]"
        } ${tone === "teal" && highlight ? "text-teal-200" : ""}`}
      >
        {label}
      </span>
      <span
        className={`font-mono ${
          highlight
            ? small
              ? "text-sm"
              : "text-base font-semibold"
            : "text-sm"
        } ${tone === "teal" && highlight ? "text-teal-100" : ""}`}
      >
        {value} {unit}
      </span>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

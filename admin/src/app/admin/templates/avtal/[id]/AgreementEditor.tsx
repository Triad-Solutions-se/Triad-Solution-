"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/Chip";
import { Download, FileSignature, Save, Trash2, AlertTriangle } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  org_number: string | null;
  address: string | null;
};

type Agreement = {
  id: string;
  agreement_number: string | null;
  status: string;
  agreement_date: string;
  start_date: string;
  notes: string | null;
  offer_id: string | null;
  pub_template_id: string | null;
  customer_id: string | null;
  customer: Customer | null;
  offer: {
    id: string;
    offer_number: string | null;
    title: string | null;
    offer_date: string;
  } | null;
  pub_template: { id: string; name: string; file_name: string } | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = [
  { value: "draft", label: "Utkast", tone: "gray" },
  { value: "signed", label: "Signerad", tone: "green" },
  { value: "terminated", label: "Avslutad", tone: "red" },
] as const;

export function AgreementEditor({
  agreement,
  templates,
  offers,
}: {
  agreement: Agreement;
  templates: { id: string; name: string; is_active: boolean }[];
  offers: { id: string; offer_number: string | null; title: string | null; customer: { id: string; name: string } | null }[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [f, setF] = useState({
    offer_id: agreement.offer_id ?? "",
    pub_template_id: agreement.pub_template_id ?? "",
    agreement_date: agreement.agreement_date,
    start_date: agreement.start_date,
    status: agreement.status,
    notes: agreement.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<"contract" | "pub" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = agreement.customer;
  const customerMissing =
    !customer?.org_number?.trim() || !customer?.address?.trim();

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("agreements")
      .update({
        offer_id: f.offer_id || null,
        pub_template_id: f.pub_template_id || null,
        agreement_date: f.agreement_date,
        start_date: f.start_date,
        status: f.status,
        notes: f.notes || null,
      })
      .eq("id", agreement.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function del() {
    const res = await supabase
      .from("agreements")
      .delete()
      .eq("id", agreement.id);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push("/admin/templates/avtal");
    router.refresh();
  }

  async function download(kind: "contract" | "pub") {
    setDownloading(kind);
    setError(null);
    const res = await fetch(`/admin/api/agreements/${agreement.id}/${kind}`);
    if (!res.ok) {
      try {
        const body = await res.json();
        setError(body.error ?? `Nedladdning misslyckades (${res.status}).`);
      } catch {
        setError(`Nedladdning misslyckades (${res.status}).`);
      }
      setDownloading(null);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = cd.match(/filename="([^"]+)"/);
    a.download = m?.[1] ?? `${kind}-${agreement.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloading(null);
  }

  const status = STATUSES.find((s) => s.value === f.status) ?? STATUSES[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass rounded-card p-5 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
            Avtalsnummer
          </div>
          <div className="font-mono text-xl font-semibold mt-1">
            {agreement.agreement_number ?? "—"}
          </div>
          <div className="text-sm text-[var(--muted)] mt-1">
            {customer?.name ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={status.tone}>{status.label}</Chip>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Save size={14} />
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>

      {customerMissing && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            Kunden saknar organisationsnummer och/eller adress. Avtalet kan
            fortfarande sparas, men dessa fält behövs för att skapa juridiskt
            korrekta PDF:er. Komplettera kunden under Kunder.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="glass rounded-card p-5 space-y-4">
        <h3 className="font-heading text-base font-semibold">Detaljer</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Offert</span>
            <select
              value={f.offer_id}
              onChange={(e) => setF((p) => ({ ...p, offer_id: e.target.value }))}
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            >
              <option value="">— Välj offert —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {(o.offer_number ?? "—") +
                    " · " +
                    (o.customer?.name ?? "—") +
                    (o.title ? ` · ${o.title}` : "")}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-[var(--muted)]">PUB-mall</span>
            <select
              value={f.pub_template_id}
              onChange={(e) =>
                setF((p) => ({ ...p, pub_template_id: e.target.value }))
              }
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            >
              <option value="">— Välj PUB-mall —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.is_active}>
                  {t.name}
                  {!t.is_active ? " (inaktiv)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-[var(--muted)]">Avtalsdatum</span>
            <input
              type="date"
              value={f.agreement_date}
              onChange={(e) =>
                setF((p) => ({ ...p, agreement_date: e.target.value }))
              }
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-[var(--muted)]">Avtalsstart</span>
            <input
              type="date"
              value={f.start_date}
              onChange={(e) =>
                setF((p) => ({ ...p, start_date: e.target.value }))
              }
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-[var(--muted)]">Status</span>
            <select
              value={f.status}
              onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Anteckningar</span>
          <textarea
            value={f.notes}
            onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            placeholder="(valfritt) — interna noteringar"
            className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm resize-y"
          />
        </label>
      </div>

      {/* Downloads */}
      <div className="glass rounded-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-semibold">Ladda ner PDF:er</h3>
          <FileSignature size={16} className="text-teal-300" />
        </div>
        <p className="text-xs text-[var(--muted)]">
          Två separata PDF-filer genereras: Avtalet + Villkor som en PDF, och PUB-avtalet som en separat PDF.
          Alla röda platshållare auto-fylls från offert, kund och datum.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => download("contract")}
            disabled={downloading !== null || !f.offer_id}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Download size={14} />
            {downloading === "contract" ? "Genererar…" : "Avtal + Villkor (PDF)"}
          </button>
          <button
            onClick={() => download("pub")}
            disabled={downloading !== null || !f.pub_template_id}
            className="rounded-btn border border-white/10 hover:bg-white/[0.04] text-white px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Download size={14} />
            {downloading === "pub" ? "Genererar…" : "PUB-avtal (PDF)"}
          </button>
        </div>
        {!f.offer_id && (
          <div className="text-[10px] text-amber-300">
            Välj en offert ovan för att kunna ladda ner Avtal + Villkor.
          </div>
        )}
        {!f.pub_template_id && (
          <div className="text-[10px] text-amber-300">
            Välj en PUB-mall ovan för att kunna ladda ner PUB-avtalet.
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="glass rounded-card p-5 border border-rose-400/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-sm font-semibold text-rose-300">
              Radera avtal
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Raderar avtalsraden permanent. PUB-mallen och offerten påverkas inte.
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={del}
                className="rounded-btn bg-rose-500 hover:bg-rose-400 text-white px-3 py-2 text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={14} />
                Bekräfta
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-btn border border-rose-400/30 text-rose-300 hover:bg-rose-400/5 px-3 py-2 text-sm flex items-center gap-2"
            >
              <Trash2 size={14} />
              Radera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

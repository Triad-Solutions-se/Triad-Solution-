"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

type Offer = {
  id: string;
  offer_number: string | null;
  title: string | null;
  offer_date: string;
  customer: {
    id: string;
    name: string;
    org_number: string | null;
    address: string | null;
  } | null;
};

type Template = {
  id: string;
  name: string;
  is_active: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function NewAgreementButton({
  offers,
  templates,
}: {
  offers: Offer[];
  templates: Template[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    offer_id: "",
    pub_template_id: "",
    agreement_date: todayISO(),
    start_date: todayISO(),
  });
  const [error, setError] = useState<string | null>(null);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.is_active),
    [templates],
  );

  const selectedOffer = offers.find((o) => o.id === f.offer_id) ?? null;
  const customerMissing =
    !!selectedOffer &&
    (!selectedOffer.customer?.org_number?.trim() ||
      !selectedOffer.customer?.address?.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.offer_id) {
      setError("Välj en offert.");
      return;
    }
    if (!f.pub_template_id) {
      setError("Välj en PUB-mall.");
      return;
    }
    if (!selectedOffer?.customer?.id) {
      setError("Den valda offerten saknar kund.");
      return;
    }
    if (customerMissing) {
      setError(
        "Kunden saknar organisationsnummer och/eller adress. Komplettera kunden under Kunder innan du skapar avtal.",
      );
      return;
    }
    setSaving(true);
    const payload = {
      offer_id: f.offer_id,
      customer_id: selectedOffer.customer.id,
      pub_template_id: f.pub_template_id,
      agreement_date: f.agreement_date,
      start_date: f.start_date,
      status: "draft",
    };
    const { data, error: insertError } = await supabase
      .from("agreements")
      .insert(payload)
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOpen(false);
    router.push(`/admin/templates/avtal/${data.id}`);
    router.refresh();
  }

  const disabled = offers.length === 0 || activeTemplates.length === 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          offers.length === 0
            ? "Skapa minst en offert först."
            : activeTemplates.length === 0
              ? "Ladda upp minst en PUB-mall först."
              : ""
        }
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={16} />
        Nytt avtal
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-lg glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
          >
            <h3 className="font-heading text-lg font-semibold">Nytt avtal</h3>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Offert *</span>
              <select
                value={f.offer_id}
                onChange={(e) => setF((p) => ({ ...p, offer_id: e.target.value }))}
                required
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
              {offers.length === 0 && (
                <span className="text-[10px] text-amber-300 mt-1 block">
                  Inga offerter hittades. Skapa en offert först under Mallar → Offerter.
                </span>
              )}
              {customerMissing && (
                <span className="text-[10px] text-amber-300 mt-1 block">
                  Den valda offertens kund saknar organisationsnummer och/eller adress.
                  Komplettera kunden under Kunder.
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">PUB-mall *</span>
              <select
                value={f.pub_template_id}
                onChange={(e) =>
                  setF((p) => ({ ...p, pub_template_id: e.target.value }))
                }
                required
                className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="">— Välj PUB-mall —</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {activeTemplates.length === 0 && (
                <span className="text-[10px] text-amber-300 mt-1 block">
                  Inga aktiva PUB-mallar — ladda upp en .docx-fil först.
                </span>
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Avtalsdatum *</span>
                <input
                  type="date"
                  value={f.agreement_date}
                  onChange={(e) =>
                    setF((p) => ({ ...p, agreement_date: e.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Avtalsstart *</span>
                <input
                  type="date"
                  value={f.start_date}
                  onChange={(e) =>
                    setF((p) => ({ ...p, start_date: e.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {error && (
              <div className="rounded-btn border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

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
                disabled={saving || customerMissing}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? "Skapar…" : "Skapa avtal"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

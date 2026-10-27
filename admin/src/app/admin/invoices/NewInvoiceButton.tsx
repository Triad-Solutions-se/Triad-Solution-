"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Receipt } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { computeSectionTotals } from "@/lib/offer-items";
import {
  type OfferPricing,
  addDaysISO,
  computeInvoiceTotals,
  firstOfNextMonthISO,
  fmtAmount,
  linesFromOfferItems,
  offerMonthlyItems,
  offerOneTimeItems,
  periodEndISO,
  periodLabel,
  todayISO,
} from "@/lib/invoice";

type CustomerOpt = { id: string; name: string };

type OfferRow = OfferPricing & {
  id: string;
  offer_number: string | null;
  title: string | null;
  status: string;
  reference: string | null;
  vat_rate: number | string | null;
  currency: string | null;
};

type AgreementRow = {
  id: string;
  agreement_number: string | null;
  offer_id: string | null;
  start_date: string | null;
  status: string;
};

export type InvoicePreset = { customerId?: string; offerId?: string; agreementId?: string };

const BUTTON_CLS = {
  primary:
    "rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20",
  secondary:
    "rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2",
  small:
    "rounded-btn border border-white/10 hover:bg-white/10 px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
};

// Skapar ett fakturautkast för en kund, valfritt med rader hämtade från en
// offert eller ett avtal (avtalets offert), och öppnar sedan editorn.
export function NewInvoiceButton({
  customers,
  preset,
  label = "Ny faktura",
  variant = "primary",
}: {
  customers: CustomerOpt[];
  preset?: InvoicePreset;
  label?: string;
  variant?: keyof typeof BUTTON_CLS;
}) {
  const [open, setOpen] = useState(false);
  const Icon = variant === "primary" ? Plus : Receipt;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_CLS[variant]}>
        <Icon size={variant === "small" ? 12 : 16} />
        {label}
      </button>
      {open && (
        <NewInvoiceDialog customers={customers} preset={preset} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function NewInvoiceDialog({
  customers,
  preset,
  onClose,
}: {
  customers: CustomerOpt[];
  preset?: InvoicePreset;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [customerId, setCustomerId] = useState(preset?.customerId ?? "");
  const [source, setSource] = useState(
    preset?.agreementId
      ? `agreement:${preset.agreementId}`
      : preset?.offerId
        ? `offer:${preset.offerId}`
        : "",
  );
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [issuedAt, setIssuedAt] = useState(todayISO());
  const [terms, setTerms] = useState("30");
  const [ourReference, setOurReference] = useState("");
  const [includeOneTime, setIncludeOneTime] = useState(true);
  const [includeMonthly, setIncludeMonthly] = useState(false);
  const [months, setMonths] = useState("1");
  const [periodStart, setPeriodStart] = useState(firstOfNextMonthISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Standardvärden: betalningsvillkor från Inställningar, vår referens = inloggad medlem.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: settings }, { data: auth }] = await Promise.all([
        supabase.from("company_settings").select("payment_terms_days").eq("id", 1).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      if (settings?.payment_terms_days != null) setTerms(String(settings.payment_terms_days));
      if (auth.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (!cancelled && profile?.display_name) setOurReference(profile.display_name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Kundens offerter och avtal att hämta rader från.
  useEffect(() => {
    if (!customerId) {
      setOffers([]);
      setAgreements([]);
      return;
    }
    let cancelled = false;
    setLoadingSources(true);
    (async () => {
      const [o, a] = await Promise.all([
        supabase
          .from("offers")
          .select(
            "id,offer_number,title,status,reference,vat_rate,currency,project_items,monthly_items,project_price,monthly_price,project_discount_pct,monthly_discount_pct",
          )
          .eq("customer_id", customerId)
          .order("offer_date", { ascending: false }),
        supabase
          .from("agreements")
          .select("id,agreement_number,offer_id,start_date,status")
          .eq("customer_id", customerId)
          .order("agreement_date", { ascending: false }),
      ]);
      if (cancelled) return;
      setOffers((o.data ?? []) as OfferRow[]);
      setAgreements((a.data ?? []) as AgreementRow[]);
      setLoadingSources(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, customerId]);

  const agreement = source.startsWith("agreement:")
    ? agreements.find((a) => a.id === source.slice("agreement:".length)) ?? null
    : null;
  const offerId = source.startsWith("offer:") ? source.slice("offer:".length) : agreement?.offer_id ?? null;
  const offer = offerId ? offers.find((o) => o.id === offerId) ?? null : null;
  const oneTime = offer ? offerOneTimeItems(offer) : [];
  const monthly = offer ? offerMonthlyItems(offer) : [];
  const currency = offer?.currency ?? "SEK";
  const vatRate = offer ? Number(offer.vat_rate ?? 25) : 25;

  // Nytt underlag → rimliga förval: engångskostnaden om den finns, månadsavgiften
  // för avtal (eller om offerten bara har månadsavgift), perioden från avtalsstart.
  useEffect(() => {
    if (!offer) return;
    const hasOneTime = offerOneTimeItems(offer).length > 0;
    const hasMonthly = offerMonthlyItems(offer).length > 0;
    setIncludeOneTime(hasOneTime);
    setIncludeMonthly(hasMonthly && (!hasOneTime || !!agreement));
    const nextMonth = firstOfNextMonthISO();
    setPeriodStart(agreement?.start_date && agreement.start_date > nextMonth ? agreement.start_date : nextMonth);
  }, [offer?.id, agreement?.id]);

  const monthCount = clampInt(months, 1, 24, 1);
  const termsDays = clampInt(terms, 0, 365, 30);
  const withPeriod = !!offer && includeMonthly && monthly.length > 0;
  const lines = [
    ...(offer && includeOneTime ? linesFromOfferItems(oneTime, 1, "st") : []),
    ...(withPeriod ? linesFromOfferItems(monthly, monthCount, "mån") : []),
  ];
  const totals = computeInvoiceTotals(lines, vatRate, currency);
  const dueDate = addDaysISO(issuedAt, termsDays);
  const periodEnd = withPeriod ? periodEndISO(periodStart, monthCount) : "";

  async function create() {
    if (!customerId) {
      setError("Välj en kund.");
      return;
    }
    if (!issuedAt) {
      setError("Ange fakturadatum.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id,name,org_number,address,contact_person")
      .eq("id", customerId)
      .single();
    if (customerError || !customer) {
      setSaving(false);
      setError(customerError?.message ?? "Kunden hittades inte.");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("invoices")
      .insert({
        status: "draft",
        customer_id: customer.id,
        customer_name: customer.name,
        customer_org_number: customer.org_number || null,
        customer_address: customer.address || null,
        reference: offer?.reference || customer.contact_person || null,
        our_reference: ourReference.trim() || null,
        issued_at: issuedAt,
        payment_terms_days: termsDays,
        due_date: dueDate || null,
        period_start: withPeriod ? periodStart : null,
        period_end: withPeriod ? periodEnd : null,
        items: lines,
        vat_rate: vatRate,
        currency,
        net_amount: totals.net,
        vat_amount: totals.vat,
        amount_sek: totals.toPay,
        offer_id: offer?.id ?? null,
        agreement_id: agreement?.id ?? null,
      })
      .select("id")
      .single();
    if (insertError || !data) {
      setSaving(false);
      setError(insertError?.message ?? "Kunde inte skapa fakturan.");
      return;
    }
    router.push(`/admin/invoices/${data.id}`);
    router.refresh();
  }

  return (
    <Modal open onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
      >
        <div>
          <h3 className="font-heading text-lg font-semibold">Ny faktura</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Fakturanummer och OCR-nummer skapas automatiskt. Rader och belopp kan justeras i editorn innan
            fakturan skickas.
          </p>
        </div>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Kund *</span>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setSource("");
            }}
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
          <span className="text-xs text-[var(--muted)]">Underlag</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={!customerId || loadingSources}
            className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Tom faktura (lägg till rader själv)</option>
            {agreements.length > 0 && (
              <optgroup label="Avtal">
                {agreements.map((a) => {
                  const o = offers.find((x) => x.id === a.offer_id);
                  return (
                    <option key={a.id} value={`agreement:${a.id}`}>
                      {(a.agreement_number ?? "Avtal") + (o?.offer_number ? ` · offert ${o.offer_number}` : "")}
                    </option>
                  );
                })}
              </optgroup>
            )}
            {offers.length > 0 && (
              <optgroup label="Offerter">
                {offers.map((o) => (
                  <option key={o.id} value={`offer:${o.id}`}>
                    {(o.offer_number ?? "Offert") + (o.title ? ` · ${o.title}` : "")}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {customerId && !loadingSources && offers.length === 0 && (
            <span className="text-[10px] text-[var(--muted)] mt-1 block">
              Kunden har inga offerter eller avtal än.
            </span>
          )}
          {agreement && !offer && !loadingSources && (
            <span className="text-[10px] text-amber-300 mt-1 block">
              Avtalet saknar kopplad offert — fakturan skapas utan rader.
            </span>
          )}
        </label>

        {offer && (
          <div className="rounded-btn border border-white/10 bg-black/20 p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Rader från offert {offer.offer_number ?? ""}
            </div>
            <SourceCheckbox
              checked={includeOneTime}
              onChange={setIncludeOneTime}
              disabled={oneTime.length === 0}
              title="Engångskostnad"
              detail={
                oneTime.length === 0
                  ? "Inga rader"
                  : `${oneTime.length} ${oneTime.length === 1 ? "rad" : "rader"} · ${fmtAmount(computeSectionTotals(oneTime, 0).afterDiscount)} ${currency} exkl. moms`
              }
            />
            <SourceCheckbox
              checked={includeMonthly}
              onChange={setIncludeMonthly}
              disabled={monthly.length === 0}
              title="Månadsavgift"
              detail={
                monthly.length === 0
                  ? "Inga rader"
                  : `${monthly.length} ${monthly.length === 1 ? "rad" : "rader"} · ${fmtAmount(computeSectionTotals(monthly, 0).afterDiscount)} ${currency}/mån exkl. moms`
              }
            />
            {withPeriod && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Antal månader</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                    className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Period från</span>
                  <div className="mt-1">
                    <DateInput value={periodStart} onChange={(v) => setPeriodStart(v || firstOfNextMonthISO())} ariaLabel="Period från" />
                  </div>
                </label>
                <div className="col-span-2 text-[11px] text-[var(--muted)]">
                  Leveransperiod: {periodLabel(periodStart, periodEnd)}
                </div>
              </div>
            )}
            {currency !== "SEK" && (
              <div className="text-[11px] text-amber-300">
                Offerten är i {currency}. Bankgiro och OCR fungerar bara för betalningar i SEK.
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Fakturadatum</span>
            <div className="mt-1">
              <DateInput value={issuedAt} onChange={setIssuedAt} ariaLabel="Fakturadatum" />
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Betalningsvillkor (dagar)</span>
            <input
              type="number"
              min={0}
              max={365}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Förfallodatum: <span className="text-white font-mono">{dueDate || "—"}</span></span>
          {lines.length > 0 && (
            <span>
              Att betala: <span className="text-white font-mono">{fmtAmount(totals.toPay)} {currency}</span> inkl. moms
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-btn border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-300">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">
            Avbryt
          </button>
          <button
            type="button"
            onClick={create}
            disabled={saving || !customerId}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? "Skapar…" : "Skapa faktura"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SourceCheckbox({
  checked,
  onChange,
  disabled,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-teal-500"
      />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-[var(--muted)] font-mono">{detail}</span>
      </span>
    </label>
  );
}

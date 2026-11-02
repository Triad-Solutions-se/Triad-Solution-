"use client";
// Återkommande intäkter & fakturering (public.recurring_income). En plan kan
// antingen skapa ett fakturautkast per period ("Fakturera automatiskt",
// migration 0036) eller — som tidigare — bara intäktsrader i Ekonomi.
// Formuläret hämtar sina listor själv så att det kan öppnas från Ekonomi,
// avtals- och offertsidan med förvalda värden.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Receipt, Repeat, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";
import {
  type InvoiceLine,
  type OfferPricing,
  INVOICE_UNITS,
  computeInvoiceTotals,
  firstOfNextMonthISO,
  fmtAmount,
  isValidEmail,
  lineAmount,
  newEmptyLine,
  normalizeLines,
  offerMonthlyItems,
  periodLabel,
  round2,
  todayISO,
} from "@/lib/invoice";
import {
  type RecurringPlan,
  BILLING_TIMINGS,
  FREQUENCIES,
  frequencyInfo,
  isFrequency,
  linesForPeriod,
  nextInvoicePeriod,
  periodAt,
  planLines,
  rescaleLines,
  toMonthly,
} from "@/lib/recurring";
import { invoiceNextPeriodNow } from "@/lib/recurring-data";
import { InvoiceStatusChip } from "../invoices/InvoiceStatusChip";

type Opt = { id: string; name: string };
type OfferRow = OfferPricing & {
  id: string;
  offer_number: string | null;
  title: string | null;
  vat_rate: number | string | null;
  currency: string | null;
  billing_interval?: string | null;
};
type AgreementRow = {
  id: string;
  agreement_number: string | null;
  offer_id: string | null;
  start_date: string | null;
  status: string;
};
type PlanInvoice = {
  id: string;
  number: string;
  status: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  amount_sek: number | string | null;
  currency: string | null;
  credited_invoice_id: string | null;
};
// Faktura som en plan har skapat, som Ekonomi-sidan skickar till planlistan.
export type PlanInvoiceRef = PlanInvoice & { recurring_income_id: string | null };

export type RecurringPreset = { customerId?: string; agreementId?: string; offerId?: string };
export type AgreementRef = { id: string; agreement_number: string | null };

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const input = "w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm";
// Smala celler i radeditorn (antal, enhet, pris).
const cell = "w-full rounded-btn bg-black/30 border border-white/10 px-2 py-2 text-sm";

const BUTTON_CLS = {
  secondary:
    "rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2",
  small:
    "rounded-btn border border-white/10 hover:bg-white/10 px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap",
};

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (raw.trim() === "" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Utkast som skapas direkt när planen sparas (perioder vars fakturadatum
// redan passerat), max 24 som i genereringen.
function dueNowCount(plan: RecurringPlan, today: string): number {
  const anchor = plan.start_date ?? plan.next_due_date;
  if (!anchor) return 0;
  let cursor = plan.next_due_date;
  let n = 0;
  while (n < 24) {
    const next = nextInvoicePeriod({ ...plan, next_due_date: cursor });
    if (!next || next.invoiceDate > today) break;
    n++;
    cursor = periodAt(anchor, plan.frequency, next.index + 1).start;
  }
  return n;
}

// Raden en intäktsplan får när den byter till fakturering: à-priset exkl.
// moms räknas fram ur planens belopp, så att kunden betalar samma som förut.
function planAmountLine(plan: RecurringPlan): InvoiceLine[] {
  const amount = Number(plan.amount_sek || 0);
  if (!(amount > 0)) return [];
  const vat = Number(plan.vat_rate ?? 25);
  const unit = plan.frequency === "monthly" ? "mån" : plan.frequency === "yearly" ? "år" : "st";
  return [{ ...newEmptyLine(), description: plan.description ?? "", unit, unit_price: round2(amount / (1 + vat / 100)) }];
}

function RecurringPlanModal({
  initial,
  preset,
  initialMode,
  onClose,
}: {
  initial?: RecurringPlan | null;
  preset?: RecurringPreset;
  // "invoice" öppnar en befintlig intäktsplan direkt i faktureringsläget.
  initialMode?: "invoice" | "income";
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const isEdit = !!initial;
  // En befintlig plan som bara skapar intäktsrader och kan byta till fakturering.
  const converting = !!initial && !initial.create_invoices;
  const today = todayISO();

  const [mode, setMode] = useState<"invoice" | "income">(
    initialMode ?? (initial ? (initial.create_invoices ? "invoice" : "income") : "invoice"),
  );
  const [f, setF] = useState(() => ({
    description: initial?.description ?? "",
    amount_sek: initial ? String(initial.amount_sek ?? "") : "",
    source: initial?.source ?? "",
    customer_id: initial?.customer_id ?? preset?.customerId ?? "",
    project_id: initial?.project_id ?? "",
    bank_account_id: initial?.bank_account_id ?? "",
    frequency: (isFrequency(initial?.frequency) ? initial!.frequency : "monthly") as string,
    next_due_date: initial?.next_due_date ?? "",
    start_date: initial?.start_date ?? (initial ? "" : firstOfNextMonthISO()),
    end_date: initial?.end_date ?? "",
    active: initial?.active ?? true,
    notes: initial?.notes ?? "",
    source_ref: initial?.agreement_id
      ? `agreement:${initial.agreement_id}`
      : initial?.offer_id
        ? `offer:${initial.offer_id}`
        : preset?.agreementId
          ? `agreement:${preset.agreementId}`
          : preset?.offerId
            ? `offer:${preset.offerId}`
            : "",
    vat_rate: String(Number(initial?.vat_rate ?? 25)),
    currency: initial?.currency ?? "SEK",
    payment_terms_days: initial?.payment_terms_days != null ? String(initial.payment_terms_days) : "",
    billing_timing: initial?.billing_timing === "arrears" ? "arrears" : "advance",
    lead_days: String(initial?.lead_days ?? 14),
    invoice_message: initial?.invoice_message ?? "",
    our_reference: initial?.our_reference ?? "",
    auto_send: initial ? initial.auto_send === true : true,
    email_to: initial?.email_to ?? "",
  }));
  const [lines, setLines] = useState<InvoiceLine[]>(() => {
    const existing = normalizeLines(initial?.items);
    return existing.length === 0 && converting && mode === "invoice" ? planAmountLine(initial!) : existing;
  });

  const [customers, setCustomers] = useState<(Opt & { email?: string | null })[]>([]);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [banks, setBanks] = useState<Opt[]>([]);
  const [defaultTerms, setDefaultTerms] = useState(30);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [planInvoices, setPlanInvoices] = useState<PlanInvoice[]>([]);
  const [saving, setSaving] = useState<null | "save" | "invoice" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  // Nya planer fylls i från avtalet/offerten när underlaget väljs (och när
  // ett förvalt underlag har laddats). Redigering rör inte befintliga rader.
  const autofill = useRef(!isEdit);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, p, b, s, auth] = await Promise.all([
        supabase.from("customers").select("id,name,email").order("name"),
        supabase.from("projects").select("id,name").order("name"),
        supabase.from("bank_accounts").select("id,name").eq("archived", false).order("name"),
        supabase.from("company_settings").select("payment_terms_days").eq("id", 1).maybeSingle(),
        isEdit ? Promise.resolve(null) : supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      const customerList = (c.data ?? []) as (Opt & { email?: string | null })[];
      setCustomers(customerList);
      // Förvald kund → fakturamejlet går till kundens e-post tills något annat anges.
      setF((prev) =>
        prev.email_to || !prev.customer_id
          ? prev
          : { ...prev, email_to: customerList.find((x) => x.id === prev.customer_id)?.email ?? "" },
      );
      setProjects((p.data ?? []) as Opt[]);
      setBanks((b.data ?? []) as Opt[]);
      if (s.data?.payment_terms_days != null) setDefaultTerms(Number(s.data.payment_terms_days));
      const uid = auth?.data.user?.id;
      if (uid) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle();
        if (!cancelled && profile?.display_name) {
          setF((prev) => (prev.our_reference ? prev : { ...prev, our_reference: profile.display_name }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, isEdit]);

  // Kundens avtal och offerter att koppla planen till.
  useEffect(() => {
    if (!f.customer_id) {
      setOffers([]);
      setAgreements([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [o, a] = await Promise.all([
        supabase.from("offers").select("*").eq("customer_id", f.customer_id).order("offer_date", { ascending: false }),
        supabase
          .from("agreements")
          .select("id,agreement_number,offer_id,start_date,status")
          .eq("customer_id", f.customer_id)
          .order("agreement_date", { ascending: false }),
      ]);
      if (cancelled) return;
      setOffers((o.data ?? []) as OfferRow[]);
      setAgreements((a.data ?? []) as AgreementRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, f.customer_id]);

  // Fakturor som planen redan skapat.
  useEffect(() => {
    if (!initial?.create_invoices) return;
    let cancelled = false;
    supabase
      .from("invoices")
      .select("id,number,status,due_date,period_start,period_end,amount_sek,currency,credited_invoice_id")
      .eq("recurring_income_id", initial.id)
      .order("period_start", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!cancelled) setPlanInvoices((data ?? []) as PlanInvoice[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, initial?.id, initial?.create_invoices]);

  const agreement = f.source_ref.startsWith("agreement:")
    ? agreements.find((a) => a.id === f.source_ref.slice("agreement:".length)) ?? null
    : null;
  const offerId = f.source_ref.startsWith("offer:") ? f.source_ref.slice("offer:".length) : agreement?.offer_id ?? null;
  const offer = offerId ? offers.find((o) => o.id === offerId) ?? null : null;
  const customerName = customers.find((c) => c.id === f.customer_id)?.name ?? "";

  function fillFromOffer(o: OfferRow, freq: string) {
    setLines(linesForPeriod(offerMonthlyItems(o), freq));
  }

  useEffect(() => {
    if (!autofill.current || mode !== "invoice") return;
    // Väntar på att kund-, avtals- och offertlistorna har laddats.
    if ((f.source_ref && !agreement && !offer) || (f.customer_id && !customerName)) return;
    autofill.current = false;
    if (!offer && !agreement) return;
    const freq = isFrequency(offer?.billing_interval) ? offer!.billing_interval! : f.frequency;
    setF((p) => ({
      ...p,
      frequency: freq,
      vat_rate: offer ? String(Number(offer.vat_rate ?? 25)) : p.vat_rate,
      currency: offer?.currency ?? p.currency,
      start_date: agreement?.start_date ?? p.start_date,
      description:
        p.description ||
        [agreement?.agreement_number ?? offer?.title ?? "Löpande avgift", customerName].filter(Boolean).join(" · "),
    }));
    if (offer) fillFromOffer(offer, freq);
  }, [mode, f.source_ref, agreement?.id, offer?.id, customerName]);

  function setFrequency(freq: string) {
    setLines((ls) => rescaleLines(ls, f.frequency, freq));
    setF((p) => ({ ...p, frequency: freq }));
  }

  function switchMode(value: "invoice" | "income") {
    setMode(value);
    if (value === "invoice" && converting && lines.length === 0) setLines(planAmountLine(initial!));
  }

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  const vatRate = f.vat_rate.trim() === "" ? 25 : Math.max(0, Math.min(100, Number(f.vat_rate) || 0));
  const totals = computeInvoiceTotals(lines, vatRate, f.currency);
  const terms = f.payment_terms_days.trim() === "" ? null : clampInt(f.payment_terms_days, 0, 365, defaultTerms);
  const leadDays = clampInt(f.lead_days, 0, 90, 14);
  const freqInfo = frequencyInfo(f.frequency);

  const draftPlan: RecurringPlan = {
    id: initial?.id ?? "new",
    description: f.description,
    amount_sek: totals.toPay,
    source: "customer",
    customer_id: f.customer_id || null,
    project_id: f.project_id || null,
    bank_account_id: f.bank_account_id || null,
    frequency: f.frequency,
    // Byter en befintlig intäktsplan till fakturering fortsätter den från
    // nästa förfallodatum, så redan passerade perioder faktureras inte.
    next_due_date: initial?.next_due_date ?? null,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    active: f.active,
    notes: f.notes || null,
    create_invoices: true,
    items: lines,
    vat_rate: vatRate,
    currency: f.currency,
    payment_terms_days: terms,
    billing_timing: f.billing_timing,
    lead_days: leadDays,
  };
  const next = mode === "invoice" ? nextInvoicePeriod(draftPlan) : null;
  const dueNow = mode === "invoice" && f.active ? dueNowCount(draftPlan, today) : 0;

  function payload() {
    const common = {
      description: f.description.trim(),
      customer_id: f.customer_id || null,
      project_id: f.project_id || null,
      bank_account_id: f.bank_account_id || null,
      frequency: f.frequency,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      active: f.active,
      notes: f.notes.trim() || null,
    };
    if (mode === "income") {
      return {
        ...common,
        amount_sek: Number(f.amount_sek || 0),
        source: f.source || null,
        next_due_date: f.next_due_date || null,
      };
    }
    return {
      ...common,
      source: "customer",
      create_invoices: true,
      agreement_id: agreement?.id ?? null,
      offer_id: offer?.id ?? null,
      items: lines,
      vat_rate: vatRate,
      currency: f.currency,
      payment_terms_days: terms,
      billing_timing: f.billing_timing,
      lead_days: leadDays,
      invoice_message: f.invoice_message.trim() || null,
      our_reference: f.our_reference.trim() || null,
      amount_sek: totals.toPay,
      auto_send: f.auto_send,
      email_to: f.email_to.trim() || null,
    };
  }

  function validate(): string | null {
    if (!f.description.trim()) return "Ange en beskrivning.";
    if (mode === "invoice") {
      if (!f.customer_id) return "Välj kund — fakturan skickas till kunden.";
      if (!f.start_date) return "Ange när första perioden börjar.";
      if (lines.length === 0) return "Lägg till minst en fakturarad.";
      if (lines.some((l) => !l.description.trim())) return "Varje fakturarad behöver en beskrivning.";
      if (f.end_date && f.end_date < f.start_date) return "Slutdatum ligger före startdatum.";
      if (f.auto_send && !isValidEmail(f.email_to)) {
        return "Ange vart fakturorna ska mejlas, eller stäng av automatiskt utskick.";
      }
    }
    return null;
  }

  function explain(message: string): string {
    if (/auto_send|email_to/i.test(message)) {
      return `${message} — automatiska fakturamejl kräver databasmigration 0038_recurring_invoice_email.`;
    }
    if (/create_invoices|billing_timing|lead_days|column .* does not exist|schema cache/i.test(message)) {
      return `${message} — återkommande fakturering kräver databasmigration 0036_economy_links_recurring_billing.`;
    }
    return message;
  }

  async function persist(): Promise<RecurringPlan | null> {
    const problem = validate();
    if (problem) {
      setError(problem);
      return null;
    }
    setError(null);
    const body = payload();
    const res =
      isEdit && initial
        ? await supabase.from("recurring_income").update(body).eq("id", initial.id).select("*").single()
        : await supabase.from("recurring_income").insert(body).select("*").single();
    if (res.error || !res.data) {
      setError(explain(res.error?.message ?? "Kunde inte spara."));
      return null;
    }
    return res.data as RecurringPlan;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving("save");
    const saved = await persist();
    setSaving(null);
    if (!saved) return;
    onClose();
    router.refresh();
  }

  async function invoiceNow() {
    setSaving("invoice");
    const saved = await persist();
    if (!saved) {
      setSaving(null);
      return;
    }
    const { invoiceId, error: invErr } = await invoiceNextPeriodNow(supabase, saved);
    if (invErr || !invoiceId) {
      setSaving(null);
      setError(invErr ?? "Kunde inte skapa fakturan.");
      router.refresh();
      return;
    }
    // Ett misslyckat utskick syns i fakturans utskickslogg, dit vi går ändå.
    if (saved.auto_send) {
      await fetch(`/admin/api/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: saved.email_to ?? undefined }),
      }).catch(() => null);
    }
    setSaving(null);
    router.push(`/admin/invoices/${invoiceId}`);
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    if (
      !confirm(
        initial.create_invoices
          ? "Ta bort den återkommande faktureringen? Fakturor som redan skapats ligger kvar."
          : "Ta bort denna återkommande intäkt?",
      )
    )
      return;
    setSaving("delete");
    const { error: delErr } = await supabase.from("recurring_income").delete().eq("id", initial.id);
    setSaving(null);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    onClose();
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as any,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }

  const canSwitchMode = !isEdit || !initial?.create_invoices;

  return (
    <Modal open onClose={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-2xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
      >
        <div>
          <h3 className="font-heading text-lg font-semibold">
            {isEdit
              ? mode === "invoice"
                ? "Återkommande fakturering"
                : "Redigera återkommande intäkt"
              : "Ny återkommande intäkt"}
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            {mode === "invoice"
              ? "Ett fakturautkast skapas automatiskt för varje period och dyker upp under Fakturor. Granska och skicka som vanligt — när fakturan betalas bokförs den som intäkt i Ekonomi."
              : "Skapar en intäktsrad i Ekonomi på varje förfallodatum, utan faktura (t.ex. bidrag eller betalningar via andra system)."}
          </p>
        </div>

        {canSwitchMode && (
          <div className="grid grid-cols-2 gap-1 rounded-btn bg-black/30 border border-white/10 p-1 text-sm">
            {(
              [
                ["invoice", "Fakturera automatiskt"],
                ["income", "Endast intäkt"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`rounded-btn px-3 py-1.5 transition-colors ${
                  mode === value ? "bg-teal-500 text-fixed-white font-semibold" : "text-[var(--muted)] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {converting && mode === "income" && (
          <div className="rounded-btn border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
            Den här planen skickar ingen faktura. Den lägger bara in en intäkt per period, som väntar tills någon
            bekräftar den. Välj <strong>Fakturera automatiskt</strong> så blir varje period en riktig faktura med
            OCR-nummer.
          </div>
        )}
        {converting && mode === "invoice" && (
          <div className="rounded-btn border border-teal-400/30 bg-teal-400/5 p-3 text-xs text-teal-200">
            Faktureringen fortsätter från {initial?.next_due_date ? fmtDate(initial.next_due_date) : "nästa period"}, så
            redan passerade perioder faktureras inte. Raden nedan är räknad så att kunden betalar samma belopp som
            förut, inkl. moms — justera den om det behövs. Intäkter som planen redan har lagt in ligger kvar under
            Intäkter, där du bekräftar eller tar bort dem.
          </div>
        )}

        <input
          autoFocus={!isEdit}
          {...bind("description")}
          placeholder={mode === "invoice" ? "Namn (t.ex. Underhåll Acme AB)" : "Beskrivning (t.ex. Underhållsavtal Acme)"}
          className={input}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Kund{mode === "invoice" ? " *" : ""}</span>
            <select
              value={f.customer_id}
              onChange={(e) => {
                autofill.current = !isEdit;
                const email = customers.find((c) => c.id === e.target.value)?.email;
                setF((p) => ({ ...p, customer_id: e.target.value, source_ref: "", email_to: email || p.email_to }));
              }}
              className={`mt-1 ${input}`}
            >
              <option value="">— Välj kund —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {mode === "invoice" ? (
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Avtal / offert</span>
              <select
                value={f.source_ref}
                onChange={(e) => {
                  autofill.current = true;
                  setF((p) => ({ ...p, source_ref: e.target.value }));
                }}
                disabled={!f.customer_id}
                className={`mt-1 ${input} disabled:opacity-50`}
              >
                <option value="">Ingen koppling</option>
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
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Belopp (SEK)</span>
                <input {...bind("amount_sek")} type="number" step="0.01" className={`mt-1 ${input} font-mono`} />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Källa</span>
                <input {...bind("source")} placeholder="t.ex. Kund" className={`mt-1 ${input}`} />
              </label>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Frekvens</span>
            <select value={f.frequency} onChange={(e) => setFrequency(e.target.value)} className={`mt-1 ${input}`}>
              {FREQUENCIES.map((fr) => (
                <option key={fr.value} value={fr.value}>
                  {fr.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">{mode === "invoice" ? "Första period börjar *" : "Startdatum"}</span>
            <div className="mt-1">
              <DateInput
                value={f.start_date}
                onChange={(v) => setF((p) => ({ ...p, start_date: v }))}
                ariaLabel="Startdatum"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Slutdatum (valfritt)</span>
            <div className="mt-1">
              <DateInput value={f.end_date} onChange={(v) => setF((p) => ({ ...p, end_date: v }))} ariaLabel="Slutdatum" />
            </div>
          </label>
          {mode === "income" ? (
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Nästa betalning</span>
              <div className="mt-1">
                <DateInput
                  value={f.next_due_date}
                  onChange={(v) => setF((p) => ({ ...p, next_due_date: v }))}
                  ariaLabel="Nästa betalning"
                />
              </div>
            </label>
          ) : (
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Fakturering</span>
              <select {...bind("billing_timing")} className={`mt-1 ${input}`}>
                {BILLING_TIMINGS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {mode === "invoice" && (
          <>
            <div className="text-[11px] text-[var(--muted)] -mt-1">
              {f.billing_timing === "advance" ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  Utkastet skapas
                  <input
                    {...bind("lead_days")}
                    type="number"
                    min={0}
                    max={90}
                    className="w-16 rounded-btn bg-black/30 border border-white/10 px-2 py-0.5 text-xs font-mono"
                  />
                  dagar innan perioden börjar.
                </span>
              ) : (
                "Utkastet skapas dagen efter att perioden slutat."
              )}
            </div>

            <div className="rounded-btn border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Rader per faktura (exkl. moms)
                </span>
                {offer && (
                  <button
                    type="button"
                    onClick={() => fillFromOffer(offer, f.frequency)}
                    className="text-[11px] text-teal-300 hover:text-teal-200"
                  >
                    Hämta från offert {offer.offer_number ?? ""}
                  </button>
                )}
              </div>
              {lines.length === 0 && (
                <p className="text-xs text-[var(--muted)]">
                  {offer
                    ? "Offerten har ingen återkommande kostnad — lägg till rader själv."
                    : "Lägg till de rader som ska stå på varje faktura."}
                </p>
              )}
              {lines.map((l) => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={l.description}
                    onChange={(e) => updateLine(l.id, { description: e.target.value })}
                    placeholder="Beskrivning"
                    className={`col-span-12 sm:col-span-4 ${input}`}
                  />
                  <input
                    type="number"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) || 0 })}
                    aria-label="Antal"
                    className={`col-span-3 sm:col-span-2 ${cell} font-mono`}
                  />
                  <select
                    value={l.unit}
                    onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                    aria-label="Enhet"
                    className={`col-span-3 sm:col-span-2 ${cell}`}
                  >
                    {[...new Set([...INVOICE_UNITS, l.unit])].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value) || 0 })}
                    aria-label="À-pris"
                    className={`col-span-4 sm:col-span-2 ${cell} font-mono`}
                  />
                  <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
                    <span className="font-mono text-xs text-[var(--muted)] truncate">{fmtAmount(lineAmount(l))}</span>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                      className="p-1 text-[var(--muted)] hover:text-rose-300"
                      aria-label="Ta bort rad"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLines((ls) => [...ls, { ...newEmptyLine(), unit: "mån", quantity: freqInfo.months }])}
                className="text-xs text-teal-300 hover:text-teal-200 flex items-center gap-1"
              >
                <Plus size={12} /> Lägg till rad
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Moms %</span>
                <input {...bind("vat_rate")} type="number" step="any" min={0} max={100} className={`mt-1 ${input} font-mono`} />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Betalningsvillkor</span>
                <input
                  {...bind("payment_terms_days")}
                  type="number"
                  min={0}
                  max={365}
                  placeholder={`${defaultTerms} dagar`}
                  className={`mt-1 ${input} font-mono`}
                />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-[var(--muted)]">Vår referens</span>
                <input {...bind("our_reference")} className={`mt-1 ${input}`} />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Fakturatext (valfri)</span>
              <textarea
                {...bind("invoice_message")}
                rows={2}
                placeholder="Visas på varje faktura, t.ex. vad avgiften avser."
                className={`mt-1 ${input} resize-y`}
              />
            </label>

            <div className="rounded-btn border border-white/10 bg-black/20 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.auto_send}
                  onChange={(e) => setF((p) => ({ ...p, auto_send: e.target.checked }))}
                  className="accent-teal-500"
                />
                Mejla fakturorna automatiskt
                <span className="text-xs text-[var(--muted)]">(PDF:en bifogas)</span>
              </label>
              {f.auto_send && (
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Fakturamejl till</span>
                  <input {...bind("email_to")} type="email" placeholder="ekonomi@kund.se" className={`mt-1 ${input}`} />
                </label>
              )}
              <p className="text-[11px] text-[var(--muted)]">
                {f.auto_send
                  ? "Varje utkast mejlas vid nästa dagliga körning (ca kl. 07–08) och markeras som skickat."
                  : "Utkasten skapas för granskning — skicka dem från fakturan."}
              </p>
              {initial?.last_error && <p className="text-[11px] text-rose-300">Senaste utskick: {initial.last_error}</p>}
            </div>

            <div className="rounded-btn border border-teal-400/20 bg-teal-400/5 p-3 text-xs space-y-1">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-[var(--muted)]">Per faktura</span>
                <span className="font-mono">
                  {fmtAmount(totals.net)} exkl. moms · <span className="text-white">{fmtAmount(totals.toPay)} {f.currency}</span> att betala
                </span>
              </div>
              {freqInfo.months > 1 && (
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-[var(--muted)]">Motsvarar per månad</span>
                  <span className="font-mono">{fmtAmount(totals.net / freqInfo.months)} {f.currency} exkl. moms</span>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-[var(--muted)]">{isEdit ? "Nästa faktura" : "Första fakturan"}</span>
                <span className="text-right">
                  {next ? (
                    <>
                      period {periodLabel(next.period.start, next.period.end)} ·{" "}
                      {next.invoiceDate <= today ? "skapas när du sparar" : `utkast ${fmtDate(next.invoiceDate)}`}
                    </>
                  ) : f.start_date ? (
                    "Inga fler perioder (slutdatum passerat)"
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              {dueNow > 1 && (
                <div className="text-amber-300">
                  {dueNow} perioder har redan passerat och skapas som utkast direkt. Börjar fakturaperioderna
                  senare, ändra &quot;Första period börjar&quot;.
                </div>
              )}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <select {...bind("project_id")} className={input}>
            <option value="">Projekt…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select {...bind("bank_account_id")} className={input}>
            <option value="">Bankkonto…</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
            className="accent-teal-500"
          />
          Aktiv{mode === "invoice" ? " — pausade planer skapar inga nya utkast" : ""}
        </label>

        <textarea {...bind("notes")} rows={2} placeholder="Interna anteckningar" className={input} />

        {planInvoices.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Senaste fakturor</div>
            <ul className="divide-y divide-white/5 rounded-btn border border-white/10">
              {planInvoices.map((inv) => (
                <li key={inv.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                  <Link href={`/admin/invoices/${inv.id}`} className="font-mono font-semibold hover:text-teal-300">
                    {inv.number}
                  </Link>
                  <span className="text-[var(--muted)] truncate">{periodLabel(inv.period_start, inv.period_end)}</span>
                  <span className="font-mono">{fmtAmount(inv.amount_sek)}</span>
                  <InvoiceStatusChip invoice={inv} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="rounded-btn border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-300">{error}</div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={remove}
                disabled={!!saving}
                className="rounded-btn px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {saving === "delete" ? "Tar bort…" : "Ta bort"}
              </button>
            )}
            {mode === "invoice" && isEdit && next && (
              <button
                type="button"
                onClick={invoiceNow}
                disabled={!!saving}
                title={`${f.auto_send ? "Skapar och mejlar fakturan" : "Skapar utkastet"} för perioden ${periodLabel(next.period.start, next.period.end)} direkt`}
                className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Receipt size={14} />{" "}
                {saving === "invoice" ? "Skapar…" : f.auto_send ? "Fakturera och mejla nästa period nu" : "Fakturera nästa period nu"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">
              Avbryt
            </button>
            <button
              type="submit"
              disabled={!!saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving === "save" ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function NewRecurringIncomeButton({
  preset,
  label = "Återkommande intäkt",
  variant = "secondary",
}: {
  preset?: RecurringPreset;
  label?: string;
  variant?: keyof typeof BUTTON_CLS;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_CLS[variant]}>
        <Repeat size={variant === "small" ? 12 : 16} />
        {label}
      </button>
      {open && <RecurringPlanModal preset={preset} onClose={() => setOpen(false)} />}
    </>
  );
}

// "Faktureras" / "Intäkt", nästa datum och belopp per period för en plan.
function planSummary(r: RecurringPlan) {
  const invoiced = !!r.create_invoices;
  const freq = frequencyInfo(r.frequency);
  const next = invoiced ? nextInvoicePeriod(r) : null;
  const problem = invoiced
    ? !r.customer_id
      ? "Saknar kund"
      : planLines(r).length === 0
        ? "Saknar rader"
        : null
    : null;
  const finished = invoiced ? !next : !!(r.end_date && !r.next_due_date && r.start_date && r.start_date <= todayISO());
  return {
    invoiced,
    freq,
    next,
    nextDate: invoiced ? next?.invoiceDate ?? null : r.next_due_date,
    amount: Number(r.amount_sek || 0),
    problem,
    status: !r.active
      ? ({ label: "Pausad", tone: "gray" } as const)
      : finished
        ? ({ label: "Avslutad", tone: "gray" } as const)
        : problem
          ? ({ label: problem, tone: "yellow" } as const)
          : ({ label: "Aktiv", tone: "green" } as const),
  };
}

export function RecurringIncomeTable({
  rows,
  customers,
  agreements = [],
  invoices = [],
}: {
  rows: RecurringPlan[];
  customers: Opt[];
  agreements?: AgreementRef[];
  // Fakturor som planerna har skapat (invoices.recurring_income_id).
  invoices?: PlanInvoiceRef[];
}) {
  // mode "invoice": öppna en intäktsplan direkt i faktureringsläget.
  const [edit, setEdit] = useState<{ plan: RecurringPlan; mode?: "invoice" } | null>(null);
  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? null : null);
  const invoicesByPlan = useMemo(() => {
    const byPlan = new Map<string, PlanInvoiceRef[]>();
    for (const inv of invoices) {
      if (!inv.recurring_income_id) continue;
      byPlan.set(inv.recurring_income_id, [...(byPlan.get(inv.recurring_income_id) ?? []), inv]);
    }
    for (const list of byPlan.values()) {
      list.sort((a, b) => String(b.period_start ?? "").localeCompare(String(a.period_start ?? "")));
    }
    return byPlan;
  }, [invoices]);
  return (
    <>
      <table className="w-full text-sm min-w-[860px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Beskrivning</th>
            <th className="p-3">Kund / avtal</th>
            <th className="p-3">Frekvens</th>
            <th className="p-3">Nästa</th>
            <th className="p-3">Belopp</th>
            <th className="p-3">Faktura</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => {
            const s = planSummary(r);
            const agreement = r.agreement_id ? agreements.find((a) => a.id === r.agreement_id) : null;
            const planInvoices = invoicesByPlan.get(r.id) ?? [];
            const latest = planInvoices[0] ?? null;
            return (
              <tr
                key={r.id}
                onClick={() => setEdit({ plan: r })}
                className="hover:bg-white/[0.04] cursor-pointer transition-colors"
              >
                <td className="p-3">
                  <div className="font-medium">{r.description}</div>
                  <div className="mt-0.5">
                    {s.invoiced ? (
                      <span className="inline-flex flex-wrap gap-1">
                        <Chip tone="teal">Faktureras</Chip>
                        {r.auto_send && <Chip tone="blue">Mejlas</Chip>}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">Endast intäkt{r.source ? ` · ${r.source}` : ""}</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-[var(--muted)]">
                  <div>{customerName(r.customer_id) ?? "—"}</div>
                  {agreement && (
                    <Link
                      href={`/admin/templates/avtal/${agreement.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-mono hover:text-teal-300"
                    >
                      {agreement.agreement_number ?? "Avtal"}
                    </Link>
                  )}
                </td>
                <td className="p-3 text-[var(--muted)]">
                  <div>{s.freq.label}</div>
                  {s.invoiced && (
                    <div className="text-xs">{r.billing_timing === "arrears" ? "Efterskott" : "Förskott"}</div>
                  )}
                </td>
                <td className="p-3 text-[var(--muted)]">
                  <div>{fmtDate(s.nextDate)}</div>
                  {s.next && <div className="text-xs">{periodLabel(s.next.period.start, s.next.period.end)}</div>}
                </td>
                <td className="p-3 font-mono">
                  <div>
                    {SEK(s.amount)}
                    <span className="text-xs text-[var(--muted)]">/{s.freq.per}</span>
                  </div>
                  {s.freq.months > 1 && (
                    <div className="text-xs text-[var(--muted)]">≈ {SEK(Math.round(toMonthly(s.amount, r.frequency)))}/mån</div>
                  )}
                </td>
                <td className="p-3">
                  {!s.invoiced ? (
                    <div className="space-y-1">
                      <div className="text-xs text-amber-300">Skapar ingen faktura</div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEdit({ plan: r, mode: "invoice" });
                        }}
                        className={BUTTON_CLS.small}
                      >
                        <Receipt size={12} /> Fakturera i stället
                      </button>
                    </div>
                  ) : latest ? (
                    <div className="space-y-1">
                      <Link
                        href={`/admin/invoices/${latest.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-semibold hover:text-teal-300"
                      >
                        {latest.number}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <InvoiceStatusChip invoice={latest} />
                        {planInvoices.length > 1 && (
                          <span className="text-[11px] text-[var(--muted)]">{planInvoices.length} st</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Ingen än</span>
                  )}
                </td>
                <td className="p-3">
                  <Chip tone={s.status.tone}>{s.status.label}</Chip>
                  {r.last_error && (
                    <div className="mt-1" title={r.last_error}>
                      <Chip tone="red">Utskick misslyckades</Chip>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga återkommande intäkter än. Lägg upp återkommande fakturering från ett avtal eller med Ny plan ovan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && <RecurringPlanModal initial={edit.plan} initialMode={edit.mode} onClose={() => setEdit(null)} />}
    </>
  );
}

// Kompakt lista för avtals- och offertsidan: planer kopplade dit + knapp för
// att lägga upp en ny med avtalet/offerten förvald.
export function LinkedRecurring({
  plans,
  preset,
  hint,
}: {
  plans: RecurringPlan[];
  preset: RecurringPreset;
  hint?: string;
}) {
  const [edit, setEdit] = useState<RecurringPlan | null>(null);
  return (
    <div className="glass rounded-card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          Återkommande fakturering
        </h2>
        {preset.customerId && <NewRecurringIncomeButton preset={preset} label="Lägg upp" variant="small" />}
      </div>
      {plans.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {preset.customerId
            ? hint ?? "Ingen återkommande fakturering än."
            : "Koppla en kund för att kunna lägga upp återkommande fakturering."}
        </p>
      ) : (
        <ul className="divide-y divide-white/5 -my-1">
          {plans.map((r) => {
            const s = planSummary(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEdit(r)}
                  className="w-full py-2 flex items-center justify-between gap-3 text-sm text-left hover:text-teal-200"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{r.description}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {s.freq.label}
                      {s.nextDate ? ` · nästa ${fmtDate(s.nextDate)}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs">
                      {SEK(s.amount)}/{s.freq.per}
                    </div>
                    <Chip tone={s.status.tone}>{s.status.label}</Chip>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <RecurringPlanModal initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

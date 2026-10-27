"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/Chip";
import { DateInput } from "@/components/DateInput";
import { fmtDate } from "@/lib/date";
import type { CompanyInfo } from "@/lib/company";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  type InvoiceLine,
  type InvoiceRecord,
  type InvoiceSettings,
  INVOICE_STATUS,
  INVOICE_UNITS,
  addDaysISO,
  computeInvoiceTotals,
  creditLines,
  effectiveStatus,
  fmtAmount,
  formatBankgiro,
  isInvoiceStatus,
  isValidBankgiro,
  lineAmount,
  linesFromOfferItems,
  missingForSend,
  newEmptyLine,
  newLineId,
  nextPeriod,
  normalizeLines,
  offerMonthlyItems,
  offerOneTimeItems,
  type OfferPricing,
  todayISO,
} from "@/lib/invoice";

type CustomerOpt = {
  id: string;
  name: string;
  org_number: string | null;
  address: string | null;
  contact_person: string | null;
  email: string | null;
};
type OfferOpt = OfferPricing & { id: string; offer_number: string | null; title: string | null; customer_id: string | null };
type AgreementOpt = { id: string; agreement_number: string | null; customer_id: string | null; offer_id: string | null };
type ProjectOpt = { id: string; name: string; customer_id: string | null };
type InvoiceRef = { id: string; number: string; status: string; paid_at?: string | null };

const input =
  "w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed";

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (raw.trim() === "" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function InvoiceEditor({
  invoice,
  customers,
  offers,
  agreements,
  projects,
  credits,
  original,
  company,
  settings,
}: {
  invoice: InvoiceRecord;
  customers: CustomerOpt[];
  offers: OfferOpt[];
  agreements: AgreementOpt[];
  projects: ProjectOpt[];
  credits: InvoiceRef[];
  original: InvoiceRef | null;
  company: CompanyInfo;
  settings: InvoiceSettings;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const isCredit = !!invoice.credited_invoice_id;
  const status = isInvoiceStatus(invoice.status) ? invoice.status : "draft";
  const locked = status !== "draft";
  const kind = isCredit ? "Kreditfaktura" : "Faktura";

  const [f, setF] = useState({
    customer_id: invoice.customer_id ?? "",
    customer_name: invoice.customer_name ?? "",
    customer_org_number: invoice.customer_org_number ?? "",
    customer_address: invoice.customer_address ?? "",
    reference: invoice.reference ?? "",
    our_reference: invoice.our_reference ?? "",
    issued_at: invoice.issued_at ?? "",
    payment_terms_days: String(invoice.payment_terms_days ?? settings.paymentTermsDays),
    period_start: invoice.period_start ?? "",
    period_end: invoice.period_end ?? "",
    vat_rate: String(Number(invoice.vat_rate ?? 25)),
    currency: invoice.currency ?? "SEK",
    message: invoice.message ?? "",
    notes: invoice.notes ?? "",
    offer_id: invoice.offer_id ?? "",
    agreement_id: invoice.agreement_id ?? "",
    project_id: invoice.project_id ?? "",
  });
  const [lines, setLines] = useState<InvoiceLine[]>(() => normalizeLines(invoice.items));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const terms = clampInt(f.payment_terms_days, 0, 365, settings.paymentTermsDays);
  const vatRate = f.vat_rate.trim() === "" ? 25 : Math.max(0, Math.min(100, Number(f.vat_rate) || 0));
  const dueDate = isCredit ? "" : addDaysISO(f.issued_at, terms);
  const totals = computeInvoiceTotals(lines, vatRate, f.currency);
  const eff = effectiveStatus({ status, due_date: invoice.due_date, credited_invoice_id: invoice.credited_invoice_id });
  const statusInfo = INVOICE_STATUS[eff];

  const periodInvalid = !!f.period_start && !!f.period_end && f.period_end < f.period_start;
  const missing = [
    ...missingForSend(
      {
        customer_name: f.customer_name,
        customer_address: f.customer_address,
        issued_at: f.issued_at || null,
        due_date: dueDate || null,
        credited_invoice_id: invoice.credited_invoice_id,
      },
      lines,
      company,
      settings,
    ),
    ...(periodInvalid ? ["Leveransperioden slutar före start"] : []),
  ];

  const customer = customers.find((c) => c.id === f.customer_id) ?? null;
  const customerOffers = f.customer_id ? offers.filter((o) => o.customer_id === f.customer_id) : offers;
  const customerAgreements = f.customer_id
    ? agreements.filter((a) => a.customer_id === f.customer_id)
    : agreements;
  // Kundens projekt i första hand (plus ett redan valt projekt), annars alla.
  const customerProjects = f.customer_id
    ? projects.filter((p) => p.customer_id === f.customer_id || p.id === f.project_id)
    : [];
  const projectOpts = customerProjects.length > 0 ? customerProjects : projects;
  const linkedAgreement = agreements.find((a) => a.id === f.agreement_id) ?? null;
  const linkedOffer =
    offers.find((o) => o.id === f.offer_id) ?? offers.find((o) => o.id === linkedAgreement?.offer_id) ?? null;

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  }
  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        set(k, e.target.value as (typeof f)[K]),
    };
  }
  function changeLines(next: InvoiceLine[]) {
    setLines(next);
    setDirty(true);
  }

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      customer_id: id,
      customer_name: c?.name ?? p.customer_name,
      customer_org_number: c ? c.org_number ?? "" : p.customer_org_number,
      customer_address: c ? c.address ?? "" : p.customer_address,
      reference: p.reference || c?.contact_person || "",
      offer_id: offers.find((o) => o.id === p.offer_id)?.customer_id === id ? p.offer_id : "",
      agreement_id: agreements.find((a) => a.id === p.agreement_id)?.customer_id === id ? p.agreement_id : "",
      project_id: projects.find((x) => x.id === p.project_id)?.customer_id === id ? p.project_id : "",
    }));
    setDirty(true);
  }

  function refreshCustomer() {
    if (!customer) return;
    setF((p) => ({
      ...p,
      customer_name: customer.name,
      customer_org_number: customer.org_number ?? "",
      customer_address: customer.address ?? "",
    }));
    setDirty(true);
  }

  function pickAgreement(id: string) {
    const a = agreements.find((x) => x.id === id);
    setF((p) => ({ ...p, agreement_id: id, offer_id: a?.offer_id ?? p.offer_id }));
    setDirty(true);
  }

  function importFromOffer(kind: "oneTime" | "monthly") {
    if (!linkedOffer) return;
    const items = kind === "oneTime" ? offerOneTimeItems(linkedOffer) : offerMonthlyItems(linkedOffer);
    changeLines([...lines, ...linesFromOfferItems(items, 1, kind === "oneTime" ? "st" : "mån")]);
  }

  function payload() {
    return {
      customer_id: f.customer_id || null,
      customer_name: f.customer_name.trim() || null,
      customer_org_number: f.customer_org_number.trim() || null,
      customer_address: f.customer_address.trim() || null,
      reference: f.reference.trim() || null,
      our_reference: f.our_reference.trim() || null,
      issued_at: f.issued_at || null,
      payment_terms_days: terms,
      due_date: dueDate || null,
      period_start: f.period_start || null,
      period_end: f.period_end || null,
      items: lines,
      vat_rate: vatRate,
      currency: f.currency,
      net_amount: totals.net,
      vat_amount: totals.vat,
      amount_sek: totals.toPay,
      message: f.message.trim() || null,
      notes: f.notes.trim() || null,
      offer_id: f.offer_id || null,
      agreement_id: f.agreement_id || null,
      project_id: f.project_id || null,
    };
  }

  // Sparar utkastet (allt) eller — när fakturan är låst — bara anteckningarna.
  async function save(extra: Record<string, unknown> = {}): Promise<boolean> {
    setError(null);
    const body = locked ? { notes: f.notes.trim() || null, ...extra } : { ...payload(), ...extra };
    const { error } = await supabase.from("invoices").update(body).eq("id", invoice.id);
    if (error) {
      setError(error.message);
      return false;
    }
    setDirty(false);
    router.refresh();
    return true;
  }

  async function update(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const { error } = await supabase.from("invoices").update(body).eq("id", invoice.id);
    if (error) {
      setError(error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  const pdfUrl = `/admin/api/invoices/${invoice.id}/pdf`;

  // Fönstret öppnas direkt i klicket (annars blockeras det som popup) och får
  // sin adress när ett ev. osparat utkast har sparats.
  function preview() {
    const w = window.open("", "_blank");
    run("preview", async () => {
      if (!locked && dirty && !(await save())) {
        w?.close();
        return;
      }
      if (w) w.location.href = pdfUrl;
      else window.location.href = pdfUrl;
    });
  }

  function download() {
    run("download", async () => {
      if (!locked && dirty && !(await save())) return;
      const res = await fetch(`${pdfUrl}?download=1`);
      if (!res.ok) {
        let msg = `Kunde inte skapa PDF (${res.status}).`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* inte JSON */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const m = (res.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? `${kind}_${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  function finalize() {
    if (missing.length > 0) {
      setError(`Komplettera innan fakturan skickas: ${missing.join(", ")}.`);
      return;
    }
    if (
      !confirm(
        `Slutför ${kind.toLowerCase()} ${invoice.number}? Den markeras som skickad och låses för redigering.`,
      )
    )
      return;
    run("finalize", async () => {
      const ok = await save({ status: "sent", sent_at: new Date().toISOString() });
      if (ok && isCredit && original) {
        const { error } = await supabase.from("invoices").update({ status: "credited" }).eq("id", original.id);
        if (error) setError(`Kreditfakturan skickades men originalet kunde inte markeras: ${error.message}`);
      }
    });
  }

  function registerPayment() {
    if (!payDate) return;
    run("pay", async () => {
      if (await update({ status: "paid", paid_at: payDate })) setPayOpen(false);
    });
  }

  function undoPayment() {
    if (!confirm("Ta bort betalningen och markera fakturan som obetald igen?")) return;
    run("unpay", () => update({ status: "sent", paid_at: null }));
  }

  function revertToDraft() {
    if (
      !confirm(
        "Återställa till utkast? Gör bara det om fakturan inte har skickats till kunden — annars ska den krediteras.",
      )
    )
      return;
    run("revert", async () => {
      const ok = await update({ status: "draft", sent_at: null, paid_at: null });
      if (ok && isCredit && original && original.status === "credited") {
        await supabase
          .from("invoices")
          .update({ status: original.paid_at ? "paid" : "sent" })
          .eq("id", original.id);
      }
    });
  }

  function createCredit() {
    if (
      !confirm(
        `Skapa en kreditfaktura för hela faktura ${invoice.number}? Den öppnas som utkast — när den slutförs markeras originalet som krediterat.`,
      )
    )
      return;
    run("credit", async () => {
      const items = creditLines(normalizeLines(invoice.items));
      const t = computeInvoiceTotals(items, invoice.vat_rate, invoice.currency);
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          status: "draft",
          credited_invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          customer_name: invoice.customer_name,
          customer_org_number: invoice.customer_org_number,
          customer_address: invoice.customer_address,
          reference: invoice.reference,
          our_reference: invoice.our_reference,
          issued_at: todayISO(),
          payment_terms_days: 0,
          due_date: null,
          period_start: invoice.period_start,
          period_end: invoice.period_end,
          items,
          vat_rate: invoice.vat_rate,
          currency: invoice.currency,
          net_amount: t.net,
          vat_amount: t.vat,
          amount_sek: t.toPay,
          message: `Kreditering av faktura ${invoice.number}.`,
          offer_id: invoice.offer_id,
          agreement_id: invoice.agreement_id,
          project_id: invoice.project_id,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte skapa kreditfaktura.");
      router.push(`/admin/invoices/${data.id}`);
      router.refresh();
    });
  }

  // Ny faktura med samma rader — perioden flyttas fram ett steg (t.ex. nästa
  // månads underhållsfaktura) och kunduppgifterna hämtas på nytt.
  function duplicate() {
    run("duplicate", async () => {
      const issued = todayISO();
      const period = nextPeriod(invoice.period_start, invoice.period_end);
      const items = normalizeLines(invoice.items).map((l) => ({ ...l, id: newLineId() }));
      const t = computeInvoiceTotals(items, invoice.vat_rate, invoice.currency);
      const c = customers.find((x) => x.id === invoice.customer_id);
      const termsDays = Number(invoice.payment_terms_days ?? settings.paymentTermsDays);
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          status: "draft",
          customer_id: invoice.customer_id,
          customer_name: c?.name ?? invoice.customer_name,
          customer_org_number: c ? c.org_number : invoice.customer_org_number,
          customer_address: c ? c.address : invoice.customer_address,
          reference: invoice.reference,
          our_reference: invoice.our_reference,
          issued_at: issued,
          payment_terms_days: termsDays,
          due_date: addDaysISO(issued, termsDays),
          period_start: period?.start ?? null,
          period_end: period?.end ?? null,
          items,
          vat_rate: invoice.vat_rate,
          currency: invoice.currency,
          net_amount: t.net,
          vat_amount: t.vat,
          amount_sek: t.toPay,
          message: invoice.message,
          offer_id: invoice.offer_id,
          agreement_id: invoice.agreement_id,
          project_id: invoice.project_id,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte duplicera fakturan.");
      router.push(`/admin/invoices/${data.id}`);
      router.refresh();
    });
  }

  function remove() {
    run("delete", async () => {
      const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (error) throw new Error(error.message);
      router.push("/admin/invoices");
      router.refresh();
    });
  }

  function mailtoHref(): string {
    const subject = `${kind} ${invoice.number} från ${company.name}`;
    const body = [
      `Hej${f.reference ? ` ${f.reference}` : ""},`,
      "",
      isCredit
        ? `Här kommer kreditfaktura ${invoice.number}, som krediterar faktura ${original?.number ?? ""}.`
        : `Här kommer faktura ${invoice.number} från ${company.name}.`,
      "",
      ...(isCredit
        ? []
        : [
            `Att betala: ${fmtAmount(totals.toPay)} ${f.currency}`,
            `Förfallodatum: ${invoice.due_date ?? dueDate}`,
            `Bankgiro: ${formatBankgiro(settings.bankgiro)}`,
            `OCR-nummer: ${invoice.ocr ?? ""}`,
            "",
          ]),
      "Fakturan bifogas som PDF.",
      "",
      "Med vänliga hälsningar",
      f.our_reference || company.name,
      company.name,
    ].join("\n");
    return `mailto:${customer?.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function copyOcr() {
    if (!invoice.ocr) return;
    try {
      await navigator.clipboard.writeText(invoice.ocr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* urklipp blockerat */
    }
  }

  const btn =
    "rounded-btn bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const bankgiroOk = isValidBankgiro(settings.bankgiro);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-[var(--muted)] font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {kind} #{invoice.number}
              </span>
              {invoice.ocr && (
                <button
                  type="button"
                  onClick={copyOcr}
                  title="Kopiera OCR-numret"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  OCR {invoice.ocr} <Copy size={11} />
                  {copied && <span className="text-teal-300 font-sans">Kopierat</span>}
                </button>
              )}
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight mt-1 truncate">
              {f.customer_name || kind}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[var(--muted)]">
              <Chip tone={statusInfo.tone}>{statusInfo.label}</Chip>
              <span>Skapad {fmtDate(invoice.created_at)}</span>
              {invoice.sent_at && <span>· Skickad {fmtDate(invoice.sent_at)}</span>}
              {invoice.paid_at && <span>· Betald {fmtDate(invoice.paid_at)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isCredit && (
              <button onClick={duplicate} disabled={!!busy} className={btn} title="Ny faktura med samma rader, nästa period">
                <Copy size={14} /> {busy === "duplicate" ? "Kopierar…" : "Duplicera"}
              </button>
            )}
            <button onClick={preview} disabled={!!busy} className={btn} title="Öppna PDF:en i en ny flik">
              <Eye size={14} /> Förhandsgranska
            </button>
            <button onClick={download} disabled={!!busy} className={btn}>
              <Download size={14} /> {busy === "download" ? "Skapar…" : "Ladda ner PDF"}
            </button>
            {(!locked || dirty) && (
              <button
                onClick={() => run("save", () => save())}
                disabled={!!busy}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Save size={14} /> {busy === "save" ? "Sparar…" : locked ? "Spara anteckningar" : "Spara"}
              </button>
            )}
          </div>
        </div>

        {/* Status-åtgärder */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-2">
          {status === "draft" && (
            <>
              <button
                onClick={finalize}
                disabled={!!busy || missing.length > 0}
                className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Send size={14} /> {busy === "finalize" ? "Slutför…" : "Slutför och markera som skickad"}
              </button>
              <span className="text-xs text-[var(--muted)]">
                Låser {kind.toLowerCase()}n. Ladda sedan ner PDF:en och skicka den till kunden.
              </span>
            </>
          )}

          {!isCredit && (status === "sent" || status === "overdue") && (
            <>
              {payOpen ? (
                <div className="flex flex-wrap items-center gap-2 rounded-btn border border-emerald-400/20 bg-emerald-400/5 p-2">
                  <span className="text-xs text-emerald-200">Betald den</span>
                  <div className="w-40">
                    <DateInput value={payDate} onChange={setPayDate} ariaLabel="Betaldatum" />
                  </div>
                  <button
                    onClick={registerPayment}
                    disabled={!!busy || !payDate}
                    className="rounded-btn bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy === "pay" ? "Sparar…" : "Spara betalning"}
                  </button>
                  <button onClick={() => setPayOpen(false)} className="rounded-btn px-2 py-2 text-[var(--muted)] hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPayOpen(true)}
                  disabled={!!busy}
                  className="rounded-btn bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 size={14} /> Registrera betalning
                </button>
              )}
              <a href={mailtoHref()} className={btn} title="Öppnar ditt e-postprogram — bifoga PDF:en">
                <Mail size={14} /> E-posta kunden
              </a>
            </>
          )}

          {isCredit && status === "sent" && (
            <a href={mailtoHref()} className={btn} title="Öppnar ditt e-postprogram — bifoga PDF:en">
              <Mail size={14} /> E-posta kunden
            </a>
          )}

          {status === "paid" && (
            <button onClick={undoPayment} disabled={!!busy} className={btn}>
              <Undo2 size={14} /> Ångra betalning
            </button>
          )}

          {!isCredit && (status === "sent" || status === "overdue" || status === "paid") && (
            <button onClick={createCredit} disabled={!!busy} className={btn}>
              <Ban size={14} /> {busy === "credit" ? "Skapar…" : "Kreditera"}
            </button>
          )}

          {(status === "sent" || status === "overdue") && (
            <button onClick={revertToDraft} disabled={!!busy} className={`${btn} text-[var(--muted)]`}>
              <RotateCcw size={14} /> Återställ till utkast
            </button>
          )}

          {status === "credited" && (
            <span className="text-sm text-orange-200 flex flex-wrap items-center gap-1">
              Krediterad av
              {credits.map((c, i) => (
                <span key={c.id}>
                  <Link href={`/admin/invoices/${c.id}`} className="font-mono underline hover:text-white">
                    {c.number}
                  </Link>
                  {i < credits.length - 1 ? "," : ""}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-300">{error}</div>
      )}

      {locked && (
        <div className="glass rounded-xl border border-white/10 p-4 text-sm text-[var(--muted)] flex items-start gap-2">
          <Lock size={16} className="shrink-0 mt-0.5" />
          <span>
            {isCredit
              ? "Kreditfakturan är skickad och låst."
              : "Fakturan är skickad och låst. Korrigera genom att kreditera den och skapa en ny."}{" "}
            Interna anteckningar kan fortfarande ändras.
          </span>
        </div>
      )}

      {status === "draft" && missing.length > 0 && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Behövs innan {kind.toLowerCase()}n kan skickas:</div>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {missing.map((m) => (
                <li key={m}>
                  {m.includes("(Inställningar)") ? (
                    <Link href="/admin/settings" className="underline hover:text-white">
                      {m}
                    </Link>
                  ) : (
                    m
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vänster kolumn */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Fakturamottagare">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block sm:col-span-2">
                <span className="text-xs text-[var(--muted)]">Kund</span>
                <div className="mt-1 flex gap-2">
                  <select
                    value={f.customer_id}
                    onChange={(e) => pickCustomer(e.target.value)}
                    disabled={locked}
                    className={input}
                  >
                    <option value="">— Ingen kopplad kund —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {!locked && customer && (
                    <button
                      type="button"
                      onClick={refreshCustomer}
                      title="Hämta namn, org.nr och adress från kundregistret igen"
                      className="rounded-btn border border-white/10 hover:bg-white/10 px-3 text-[var(--muted)] hover:text-white"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-[var(--muted)] mt-1 block">
                  Uppgifterna kopieras till fakturan — ändringar här påverkar inte kundregistret.
                </span>
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Namn på fakturan *</span>
                <input {...bind("customer_name")} disabled={locked} className={`mt-1 ${input}`} />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Org.nr</span>
                <input {...bind("customer_org_number")} disabled={locked} className={`mt-1 ${input} font-mono`} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-[var(--muted)]">Fakturaadress *</span>
                <textarea
                  {...bind("customer_address")}
                  disabled={locked}
                  rows={2}
                  placeholder={"Gatuadress\nPostnummer Ort"}
                  className={`mt-1 ${input} resize-y`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Er referens</span>
                <input {...bind("reference")} disabled={locked} placeholder="Kundens kontaktperson" className={`mt-1 ${input}`} />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Vår referens</span>
                <input {...bind("our_reference")} disabled={locked} className={`mt-1 ${input}`} />
              </label>
            </div>
          </Card>

          <Card title="Datum & villkor">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DateField label="Fakturadatum *" value={f.issued_at} onChange={(v) => set("issued_at", v)} locked={locked} />
              {!isCredit && (
                <>
                  <label className="block">
                    <span className="text-xs text-[var(--muted)]">Betalningsvillkor (dagar)</span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      {...bind("payment_terms_days")}
                      disabled={locked}
                      className={`mt-1 ${input} font-mono`}
                    />
                  </label>
                  <div>
                    <span className="text-xs text-[var(--muted)]">Förfallodatum</span>
                    <div className="mt-1 rounded-btn border border-white/5 bg-black/10 px-3 py-2 text-sm font-mono">
                      {dueDate || "—"}
                    </div>
                  </div>
                </>
              )}
              <DateField
                label="Leveransperiod från"
                value={f.period_start}
                onChange={(v) => set("period_start", v)}
                locked={locked}
              />
              <DateField
                label="Leveransperiod till"
                value={f.period_end}
                onChange={(v) => set("period_end", v)}
                locked={locked}
              />
            </div>
            <p className="text-[10px] text-[var(--muted)]">
              Leveransdatum/-period krävs om den skiljer sig från fakturadatumet — t.ex. vilken månad
              en underhållsavgift avser.
            </p>
          </Card>

          <Card
            title="Fakturarader (exkl. moms)"
            right={
              !locked && linkedOffer ? (
                <div className="flex flex-wrap gap-1.5">
                  {offerOneTimeItems(linkedOffer).length > 0 && (
                    <button type="button" onClick={() => importFromOffer("oneTime")} className={smallBtn}>
                      <Plus size={12} /> Engångskostnad från offert
                    </button>
                  )}
                  {offerMonthlyItems(linkedOffer).length > 0 && (
                    <button type="button" onClick={() => importFromOffer("monthly")} className={smallBtn}>
                      <Plus size={12} /> Månadsavgift från offert
                    </button>
                  )}
                </div>
              ) : undefined
            }
          >
            <LinesEditor lines={lines} onChange={changeLines} currency={f.currency} locked={locked} />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Moms %</span>
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  {...bind("vat_rate")}
                  disabled={locked}
                  className={`mt-1 ${input} font-mono`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Valuta</span>
                <select {...bind("currency")} disabled={locked} className={`mt-1 ${input}`}>
                  <option value="SEK">SEK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            {f.currency !== "SEK" && (
              <p className="text-[11px] text-amber-300">
                Bankgiro och OCR fungerar bara för betalningar i SEK.
              </p>
            )}
          </Card>

          <Card title="Fakturatext">
            <textarea
              {...bind("message")}
              disabled={locked}
              rows={3}
              placeholder="Visas på fakturan ovanför raderna, t.ex. vad fakturan avser."
              className={`${input} resize-y`}
            />
          </Card>

          <Card title="Kopplingar">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Avtal</span>
                <select
                  value={f.agreement_id}
                  onChange={(e) => pickAgreement(e.target.value)}
                  disabled={locked}
                  className={`mt-1 ${input}`}
                >
                  <option value="">—</option>
                  {customerAgreements.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agreement_number ?? a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Offert</span>
                <select {...bind("offer_id")} disabled={locked} className={`mt-1 ${input}`}>
                  <option value="">—</option>
                  {customerOffers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {(o.offer_number ?? "—") + (o.title ? ` · ${o.title}` : "")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">Projekt</span>
                <select {...bind("project_id")} disabled={locked} className={`mt-1 ${input}`}>
                  <option value="">—</option>
                  {projectOpts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[10px] text-[var(--muted)]">
              Avtals- och offertnummer skrivs ut på fakturan under &quot;Avser&quot;.
            </p>
          </Card>

          <Card title="Interna anteckningar">
            <textarea
              {...bind("notes")}
              rows={3}
              placeholder="Syns inte på fakturan."
              className={`${input} resize-y`}
            />
          </Card>

          {status === "draft" && (
            <div className="glass rounded-card p-5 border border-rose-500/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-sm font-semibold text-rose-300 flex items-center gap-2">
                    <AlertTriangle size={14} /> Radera utkast
                  </h2>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Bara utkast kan raderas. Skickade fakturor krediteras istället.
                  </p>
                </div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-btn border border-rose-500/30 hover:bg-rose-500/10 text-rose-300 px-3 py-2 text-sm flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Radera
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="rounded-btn px-3 py-2 text-xs text-[var(--muted)]">
                      Avbryt
                    </button>
                    <button
                      onClick={remove}
                      disabled={!!busy}
                      className="rounded-btn bg-rose-500 hover:bg-rose-400 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      Bekräfta radering
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Höger kolumn */}
        <div className="space-y-4">
          <div className="glass rounded-card p-5">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
              Summa
            </h2>
            <div className="space-y-1.5 text-sm">
              <SumRow label="Netto exkl. moms" value={fmtAmount(totals.net)} unit={f.currency} />
              <SumRow label={`Moms (${vatRate} %)`} value={fmtAmount(totals.vat)} unit={f.currency} />
              {totals.rounding !== 0 && (
                <SumRow label="Öresavrundning" value={fmtAmount(totals.rounding)} unit={f.currency} />
              )}
              <div className="border-t border-white/10 pt-2 mt-2 flex items-center justify-between gap-2">
                <span className="font-semibold min-w-0">{isCredit ? "Krediterat belopp" : "Att betala"}</span>
                <span className="font-mono text-lg font-semibold text-teal-200 whitespace-nowrap">
                  {fmtAmount(totals.toPay)} {f.currency}
                </span>
              </div>
            </div>
          </div>

          {!isCredit && (
            <div className="glass rounded-card p-5 border-teal-400/20">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-teal-300 mb-3">
                Betalningsinformation
              </h2>
              <dl className="space-y-2 text-sm">
                <InfoRow label="Bankgiro">
                  {settings.bankgiro ? (
                    <span className="font-mono">{formatBankgiro(settings.bankgiro)}</span>
                  ) : (
                    <Link href="/admin/settings" className="text-amber-300 underline">
                      Saknas — fyll i
                    </Link>
                  )}
                </InfoRow>
                {settings.bankgiro && !bankgiroOk && (
                  <p className="text-[11px] text-amber-300">
                    Bankgironumret ser inte ut att stämma (kontrollsiffra). Dubbelkolla under Inställningar.
                  </p>
                )}
                <InfoRow label="OCR-nummer">
                  <span className="font-mono">{invoice.ocr ?? "—"}</span>
                </InfoRow>
                <InfoRow label="Förfallodatum">
                  <span className="font-mono">{dueDate || "—"}</span>
                </InfoRow>
              </dl>
              <p className="text-[11px] text-[var(--muted)] mt-3">
                OCR-numret byggs av fakturanumret plus längd- och kontrollsiffra och är unikt per faktura.
              </p>
            </div>
          )}

          <div className="glass rounded-card p-5">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
              Kopplat
            </h2>
            <dl className="space-y-2 text-sm">
              {isCredit && original && (
                <InfoRow label="Krediterar">
                  <Link href={`/admin/invoices/${original.id}`} className="font-mono text-teal-300 hover:underline">
                    {original.number}
                  </Link>
                </InfoRow>
              )}
              {credits.length > 0 && (
                <InfoRow label="Krediterad av">
                  <span className="flex flex-wrap justify-end gap-x-2">
                    {credits.map((c) => (
                      <Link key={c.id} href={`/admin/invoices/${c.id}`} className="font-mono text-teal-300 hover:underline">
                        {c.number}
                      </Link>
                    ))}
                  </span>
                </InfoRow>
              )}
              <InfoRow label="Kund">
                {invoice.customer_id ? (
                  <Link href={`/admin/invoices?customer=${invoice.customer_id}`} className="text-teal-300 hover:underline">
                    Alla kundens fakturor
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow label="Avtal">
                {linkedAgreement ? (
                  <Link href={`/admin/templates/avtal/${linkedAgreement.id}`} className="font-mono text-teal-300 hover:underline">
                    {linkedAgreement.agreement_number ?? "Avtal"}
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow label="Offert">
                {f.offer_id && linkedOffer ? (
                  <Link href={`/admin/templates/offerter/${linkedOffer.id}`} className="font-mono text-teal-300 hover:underline">
                    {linkedOffer.offer_number ?? "Offert"}
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

const smallBtn =
  "rounded-btn bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-[11px] flex items-center gap-1";

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass rounded-card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <div className="mt-1">
        {locked ? (
          <div className="rounded-btn border border-white/5 bg-black/10 px-3 py-2 text-sm font-mono opacity-60">
            {value || "—"}
          </div>
        ) : (
          <DateInput value={value} onChange={onChange} ariaLabel={label} />
        )}
      </div>
    </div>
  );
}

function SumRow({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--muted)] min-w-0">{label}</span>
      <span className="font-mono whitespace-nowrap">
        {value} {unit}
      </span>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

// En rad per fakturarad från xl och uppåt; smalare än så staplas raden
// (beskrivning + ta bort överst, siffrorna med egna etiketter under).
const GRID = "xl:grid-cols-[minmax(0,1fr)_64px_60px_100px_60px_104px_28px]";

function LinesEditor({
  lines,
  onChange,
  currency,
  locked,
}: {
  lines: InvoiceLine[];
  onChange: (next: InvoiceLine[]) => void;
  currency: string;
  locked: boolean;
}) {
  function update(idx: number, patch: Partial<InvoiceLine>) {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  const cell =
    "w-full rounded-btn bg-black/30 border border-white/10 px-2 py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const caption = "xl:hidden block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-0.5";
  const removeBtn = (idx: number, cls: string) => (
    <button
      type="button"
      onClick={() => onChange(lines.filter((_, i) => i !== idx))}
      className={`${cls} h-[34px] w-8 shrink-0 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10 items-center justify-center`}
      title="Ta bort rad"
    >
      <X size={14} />
    </button>
  );

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <div className="text-[11px] text-[var(--muted)] italic py-2">
          Inga rader — lägg till en rad eller hämta från kopplad offert.
        </div>
      ) : (
        <>
          <div className={`hidden xl:grid ${GRID} gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)] px-1`}>
            <div>Beskrivning</div>
            <div className="text-right">Antal</div>
            <div>Enhet</div>
            <div className="text-right">À-pris</div>
            <div className="text-right">Rabatt %</div>
            <div className="text-right">Belopp</div>
            <div />
          </div>
          {lines.map((l, idx) => (
            <div
              key={l.id}
              className={`grid grid-cols-12 ${GRID} gap-2 items-end rounded-btn border border-white/5 bg-black/10 p-2 xl:items-center xl:border-0 xl:bg-transparent xl:p-0`}
            >
              <div className="col-span-12 xl:col-span-1 flex gap-2">
                <input
                  value={l.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  disabled={locked}
                  placeholder="Beskrivning, t.ex. Underhåll november"
                  aria-label="Beskrivning"
                  className={cell}
                />
                {!locked && removeBtn(idx, "flex xl:hidden")}
              </div>
              <label className="col-span-2 xl:col-span-1">
                <span className={caption}>Antal</span>
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(l.quantity) ? l.quantity : ""}
                  onChange={(e) => update(idx, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                  disabled={locked}
                  aria-label="Antal"
                  className={`${cell} font-mono text-right`}
                />
              </label>
              <label className="col-span-3 xl:col-span-1">
                <span className={caption}>Enhet</span>
                <input
                  value={l.unit}
                  onChange={(e) => update(idx, { unit: e.target.value })}
                  disabled={locked}
                  list="invoice-units"
                  aria-label="Enhet"
                  className={`${cell} [&::-webkit-calendar-picker-indicator]:hidden`}
                />
              </label>
              <label className="col-span-4 xl:col-span-1">
                <span className={caption}>À-pris</span>
                <input
                  type="number"
                  step="any"
                  value={l.unit_price || ""}
                  placeholder="0"
                  onChange={(e) => update(idx, { unit_price: Number(e.target.value) || 0 })}
                  disabled={locked}
                  aria-label="À-pris"
                  className={`${cell} font-mono text-right`}
                />
              </label>
              <label className="col-span-3 xl:col-span-1">
                <span className={caption}>Rabatt %</span>
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={l.discount_pct || ""}
                  placeholder="0"
                  onChange={(e) =>
                    update(idx, { discount_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                  }
                  disabled={locked}
                  aria-label="Rabatt %"
                  className={`${cell} font-mono text-right`}
                />
              </label>
              <div className="col-span-12 xl:col-span-1 order-last xl:order-none text-right font-mono text-sm">
                <span className="xl:hidden text-[10px] uppercase tracking-wider text-[var(--muted)] mr-2 font-sans">
                  Belopp
                </span>
                {fmtAmount(lineAmount(l))} <span className="xl:hidden text-[var(--muted)]">{currency}</span>
              </div>
              {locked ? <div className="hidden xl:block" /> : removeBtn(idx, "hidden xl:flex")}
            </div>
          ))}
        </>
      )}
      <datalist id="invoice-units">
        {INVOICE_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {!locked && (
        <button type="button" onClick={() => onChange([...lines, newEmptyLine()])} className={smallBtn}>
          <Plus size={12} /> Lägg till rad
        </button>
      )}
    </div>
  );
}

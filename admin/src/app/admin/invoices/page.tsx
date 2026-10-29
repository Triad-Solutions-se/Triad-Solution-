import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { SortSelect } from "@/components/SortSelect";
import { AlertTriangle, ChevronRight, Search, X } from "lucide-react";
import { effectiveStatus, fmtAmount, isOutstanding, todayISO } from "@/lib/invoice";
import { fetchInvoiceSettings } from "@/lib/invoice-data";
import { NewInvoiceButton } from "./NewInvoiceButton";
import { InvoiceStatusChip } from "./InvoiceStatusChip";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "date_desc", label: "Nyast först" },
  { value: "date_asc", label: "Äldst först" },
  { value: "due", label: "Förfallodatum" },
  { value: "number", label: "Fakturanummer" },
  { value: "amount", label: "Belopp" },
];

const FILTERS = [
  { value: "all", label: "Alla" },
  { value: "draft", label: "Utkast" },
  { value: "unpaid", label: "Obetalda" },
  { value: "overdue", label: "Förfallna" },
  { value: "paid", label: "Betalda" },
  { value: "credited", label: "Krediterade" },
];

type Row = {
  id: string;
  number: string;
  ocr: string | null;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  amount_sek: number | string | null;
  currency: string | null;
  credited_invoice_id: string | null;
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string; status?: string; customer?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "date_desc";
  const filter = sp.status ?? "all";
  const query = sp.q?.toLowerCase().trim() ?? "";

  const supabase = await createClient();
  const [invoicesRes, customersRes, { settings, error: settingsError }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id,number,ocr,status,customer_id,customer_name,issued_at,due_date,paid_at,amount_sek,currency,credited_invoice_id",
      )
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("number", { ascending: false }),
    supabase.from("customers").select("id,name").order("name"),
    fetchInvoiceSettings(supabase),
  ]);

  const error = invoicesRes.error;
  const all = (error ? [] : invoicesRes.data ?? []) as Row[];
  const customers = (customersRes.data ?? []) as { id: string; name: string }[];
  const customerFilter = sp.customer ? customers.find((c) => c.id === sp.customer) ?? null : null;
  const today = todayISO();
  const year = today.slice(0, 4);

  const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.amount_sek || 0), 0);
  const scope = customerFilter ? all.filter((r) => r.customer_id === customerFilter.id) : all;
  const outstanding = scope.filter(isOutstanding);
  const overdue = outstanding.filter((r) => effectiveStatus(r, today) === "overdue");
  const paidThisYear = scope.filter((r) => r.status === "paid" && (r.paid_at ?? "").startsWith(year));
  const drafts = scope.filter((r) => r.status === "draft");

  const rows = scope
    .filter((r) => {
      const st = effectiveStatus(r, today);
      if (filter === "draft") return st === "draft";
      if (filter === "unpaid") return isOutstanding(r);
      if (filter === "overdue") return st === "overdue";
      if (filter === "paid") return st === "paid";
      if (filter === "credited") return st === "credited" || !!r.credited_invoice_id;
      return true;
    })
    .filter((r) => {
      if (!query) return true;
      return (
        r.number.toLowerCase().includes(query) ||
        (r.ocr ?? "").includes(query) ||
        (r.customer_name ?? "").toLowerCase().includes(query)
      );
    });

  if (sort === "date_asc") rows.reverse();
  else if (sort === "due") rows.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  else if (sort === "number") rows.sort((a, b) => b.number.localeCompare(a.number, "sv", { numeric: true }));
  else if (sort === "amount") rows.sort((a, b) => Number(b.amount_sek || 0) - Number(a.amount_sek || 0));

  // Bygger länkar som behåller övriga filter.
  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { sort: sp.sort ?? null, q: sp.q ?? null, status: sp.status ?? null, customer: sp.customer ?? null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "all")) params.set(k, v);
    const qs = params.toString();
    return `/admin/invoices${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Fakturor"
        subtitle="Kundfakturor med OCR-nummer och bankgiro — skapa från kund, offert eller avtal."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="date_desc" />
            <NewInvoiceButton customers={customers} preset={customerFilter ? { customerId: customerFilter.id } : undefined} />
          </div>
        }
      />

      {error && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 mb-4">
          Fakturasystemet är inte aktiverat i databasen än. Kör migration{" "}
          <code className="font-mono">supabase/migrations/0034_invoice_system.sql</code> i Supabase.
        </div>
      )}
      {!error && !settingsError && !settings.bankgiro && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 mb-4 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Bankgironummer saknas — det måste finnas med på fakturorna.{" "}
            <Link href="/admin/settings" className="underline hover:text-white">
              Fyll i det under Inställningar
            </Link>
            .
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <Stat label="Obetalt" value={`${fmtAmount(sum(outstanding))} kr`} hint={`${outstanding.length} st`} color="blue" />
        <Stat label="Varav förfallet" value={`${fmtAmount(sum(overdue))} kr`} hint={`${overdue.length} st`} color="red" />
        <Stat label={`Betalt ${year}`} value={`${fmtAmount(sum(paidThisYear))} kr`} hint={`${paidThisYear.length} st`} color="green" />
        <Stat label="Utkast" value={String(drafts.length)} hint="ej skickade" color="gray" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href({ status: f.value })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === f.value
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/10 text-[var(--muted)] hover:text-white hover:bg-white/5"
              }`}
            >
              {f.label}
            </Link>
          ))}
          {customerFilter && (
            <Link
              href={href({ customer: null })}
              className="rounded-full border border-teal-400/30 bg-teal-400/10 text-teal-200 px-3 py-1 text-xs flex items-center gap-1"
              title="Visa alla kunder"
            >
              Kund: {customerFilter.name} <X size={12} />
            </Link>
          )}
        </div>
        <form method="GET" className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Sök nummer, OCR, kund…"
            className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-4 py-2.5 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-teal-400/40 focus:bg-black/30"
          />
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.customer && <input type="hidden" name="customer" value={sp.customer} />}
        </form>
      </div>

      {/* Desktop */}
      <div className="hidden sm:block glass rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto scroll-x-hint">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Nr</th>
                <th className="p-3">Kund</th>
                <th className="p-3">OCR</th>
                <th className="p-3">Fakturadatum</th>
                <th className="p-3">Förfaller</th>
                <th className="p-3 text-right">Att betala</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="p-3">
                    <Link href={`/admin/invoices/${r.id}`} className="font-mono text-xs font-semibold hover:text-teal-300">
                      {r.number}
                    </Link>
                    {r.credited_invoice_id && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-orange-300">Kredit</span>
                    )}
                  </td>
                  <td className="p-3 font-medium">{r.customer_name ?? "—"}</td>
                  <td className="p-3 font-mono text-xs text-[var(--muted)]">{r.ocr ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]">{fmtDate(r.issued_at)}</td>
                  <td className="p-3 text-[var(--muted)]">{r.credited_invoice_id ? "—" : fmtDate(r.due_date)}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {fmtAmount(r.amount_sek)} {r.currency ?? "SEK"}
                  </td>
                  <td className="p-3">
                    <InvoiceStatusChip invoice={r} />
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/invoices/${r.id}`} className="text-[var(--muted)] hover:text-white">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-[var(--muted)]">
                    {all.length === 0
                      ? "Inga fakturor än — skapa den första via knappen ovan, eller från en offert eller ett avtal."
                      : "Inga fakturor matchar filtret."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobil */}
      <div className="sm:hidden space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/invoices/${r.id}`}
            className="glass rounded-xl border border-white/10 p-4 flex items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold">
                  {r.number}
                  {r.credited_invoice_id && <span className="ml-2 text-[10px] text-orange-300">KREDIT</span>}
                </span>
                <InvoiceStatusChip invoice={r} />
              </div>
              <div className="font-semibold text-sm truncate mt-1">{r.customer_name ?? "—"}</div>
              <div className="text-xs text-[var(--muted)] mt-1 flex justify-between gap-2">
                <span>Förfaller {r.credited_invoice_id ? "—" : fmtDate(r.due_date)}</span>
                <span className="font-mono text-white">
                  {fmtAmount(r.amount_sek)} {r.currency ?? "SEK"}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
          </Link>
        ))}
        {rows.length === 0 && !error && (
          <div className="glass rounded-xl border border-white/10 p-8 text-center text-sm text-[var(--muted)]">
            {all.length === 0 ? "Inga fakturor än." : "Inga fakturor matchar filtret."}
          </div>
        )}
      </div>
    </>
  );
}

const statColors = {
  blue: { bar: "bg-sky-400", text: "text-sky-300" },
  red: { bar: "bg-rose-400", text: "text-rose-300" },
  green: { bar: "bg-emerald-400", text: "text-emerald-300" },
  gray: { bar: "bg-white/30", text: "text-white" },
};

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color: keyof typeof statColors;
}) {
  const c = statColors[color];
  return (
    <div className="glass rounded-xl border border-white/10 p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar}`} />
      <div className="pl-2">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className={`font-heading text-lg sm:text-xl font-bold mt-1.5 ${c.text}`}>{value}</div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { SortSelect } from "@/components/SortSelect";
import { NewOfferButton } from "./NewOfferButton";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "date_desc", label: "Nyast först" },
  { value: "date_asc", label: "Äldst först" },
  { value: "status", label: "Status" },
  { value: "customer", label: "Kund (A–Ö)" },
  { value: "number", label: "Offertnummer" },
];

export default async function OffertListPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "date_desc";
  const query = sp.q?.toLowerCase() ?? "";

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id,name")
    .order("name");

  let q = supabase
    .from("offers")
    .select(
      "id,offer_number,title,status,offer_date,valid_until,project_price,monthly_price,vat_rate,currency,customer:customers(id,name)"
    );

  if (sort === "date_asc") q = q.order("offer_date", { ascending: true });
  else if (sort === "status") q = q.order("status").order("offer_date", { ascending: false });
  else if (sort === "number") q = q.order("offer_number", { ascending: false });
  else if (sort === "customer")
    q = q.order("customer_id", { nullsFirst: false }).order("offer_date", { ascending: false });
  else q = q.order("offer_date", { ascending: false });

  const { data, error } = await q;
  const offers = error
    ? []
    : (data ?? []).filter((o: any) => {
        if (!query) return true;
        return (
          o.offer_number?.toLowerCase().includes(query) ||
          o.title?.toLowerCase().includes(query) ||
          o.customer?.name?.toLowerCase().includes(query)
        );
      });

  // Sort by customer name client-side if requested (since FK can't be ordered by joined column server-side easily)
  if (sort === "customer") {
    offers.sort((a: any, b: any) =>
      (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "", "sv")
    );
  }

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/templates"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Mallar
        </Link>
      </div>
      <PageHeader
        title="Offerter"
        subtitle="Kundoffert med projektkostnad (engång) och underhållsavgift (månad)."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="date_desc" />
            <NewOfferButton customers={customers ?? []} />
          </div>
        }
      />

      {error && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 mb-4">
          Det verkar som att <code className="font-mono">offers</code>-tabellen inte är skapad än.
          Kör migration <code className="font-mono">supabase/migrations/0015_offers.sql</code> i din Supabase SQL-editor.
        </div>
      )}

      {/* Search */}
      <form method="GET" className="mb-4">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Sök offertnummer, kund, titel…"
            className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-4 py-2.5 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-teal-400/40 focus:bg-black/30"
          />
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        </div>
      </form>

      {/* Desktop table */}
      <div className="hidden sm:block glass rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto scroll-x-hint">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Nr</th>
                <th className="p-3">Kund</th>
                <th className="p-3">Titel</th>
                <th className="p-3">Datum</th>
                <th className="p-3">Giltig till</th>
                <th className="p-3 text-right">Engång</th>
                <th className="p-3 text-right">Per mån</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {offers.map((o: any) => (
                <tr key={o.id} className="hover:bg-white/[0.02]">
                  <td className="p-3">
                    <Link
                      href={`/admin/templates/offerter/${o.id}`}
                      className="font-mono text-xs font-semibold hover:text-teal-300"
                    >
                      {o.offer_number ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{o.customer?.name ?? "—"}</div>
                  </td>
                  <td className="p-3 text-[var(--muted)] truncate max-w-[200px]">
                    {o.title ?? "—"}
                  </td>
                  <td className="p-3 text-[var(--muted)]">{fmtDate(o.offer_date)}</td>
                  <td className="p-3 text-[var(--muted)]">{fmtDate(o.valid_until)}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {fmtMoney(o.project_price, o.currency)}
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {fmtMoney(o.monthly_price, o.currency)}
                  </td>
                  <td className="p-3">
                    <Chip tone={statusTone(o.status)}>{statusLabel(o.status)}</Chip>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/templates/offerter/${o.id}`}
                      className="text-[var(--muted)] hover:text-white"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              {offers.length === 0 && !error && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-[var(--muted)]">
                    {query ? "Inga offerter matchar sökningen." : "Inga offerter än — skapa din första via knappen ovan."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {offers.map((o: any) => (
          <Link
            key={o.id}
            href={`/admin/templates/offerter/${o.id}`}
            className="glass rounded-xl border border-white/10 p-4 flex items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold">
                  {o.offer_number ?? "—"}
                </span>
                <Chip tone={statusTone(o.status)}>{statusLabel(o.status)}</Chip>
              </div>
              <div className="font-semibold text-sm truncate mt-1">{o.customer?.name ?? "—"}</div>
              <div className="text-xs text-[var(--muted)] truncate">
                {o.title ?? fmtDate(o.offer_date)}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1 font-mono">
                {fmtMoney(o.project_price, o.currency)} + {fmtMoney(o.monthly_price, o.currency)}/mån
              </div>
            </div>
            <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
          </Link>
        ))}
      </div>
    </>
  );
}

function fmtMoney(n: number | null | undefined, currency = "SEK") {
  if (n == null) return "—";
  return (
    new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(n)) +
    " " +
    currency
  );
}

function statusTone(s: string | null): any {
  switch (s) {
    case "accepted":
      return "green";
    case "sent":
      return "blue";
    case "draft":
      return "gray";
    case "rejected":
      return "red";
    case "expired":
      return "orange";
    default:
      return "gray";
  }
}
function statusLabel(s: string | null) {
  switch (s) {
    case "draft":
      return "Utkast";
    case "sent":
      return "Skickad";
    case "accepted":
      return "Accepterad";
    case "rejected":
      return "Avslagen";
    case "expired":
      return "Utgången";
    default:
      return s ?? "—";
  }
}

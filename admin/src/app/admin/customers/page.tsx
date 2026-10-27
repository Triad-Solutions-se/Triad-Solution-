import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { SortSelect } from "@/components/SortSelect";
import { NewCustomerButton } from "./NewCustomerButton";
import { EditCustomerButton } from "./EditCustomerButton";
import { NewInvoiceButton } from "../invoices/NewInvoiceButton";
import { effectiveStatus, fmtAmount, isOutstanding } from "@/lib/invoice";
import { AlertTriangle, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "name", label: "Namn (A–Ö)" },
  { value: "status", label: "Status" },
  { value: "industry", label: "Bransch" },
  { value: "created_desc", label: "Nyast" },
  { value: "created_asc", label: "Äldst" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "name";
  const query = sp.q?.toLowerCase() ?? "";
  const supabase = await createClient();
  let q = supabase
    .from("customers")
    .select("id,name,org_number,address,contact_person,industry,status,email,phone,website,notes,created_at");
  if (sort === "status") q = q.order("status").order("name");
  else if (sort === "industry") q = q.order("industry", { nullsFirst: false }).order("name");
  else if (sort === "created_desc") q = q.order("created_at", { ascending: false });
  else if (sort === "created_asc") q = q.order("created_at", { ascending: true });
  else q = q.order("name");
  const [{ data }, { data: invoiceRows }] = await Promise.all([
    q,
    supabase.from("invoices").select("customer_id,status,amount_sek,due_date,credited_invoice_id"),
  ]);

  // Fakturaöversikt per kund: antal, obetalt belopp och om något har förfallit.
  const invoiceStats = new Map<string, { count: number; outstanding: number; overdue: boolean }>();
  for (const r of invoiceRows ?? []) {
    if (!r.customer_id || r.credited_invoice_id) continue;
    const st = invoiceStats.get(r.customer_id) ?? { count: 0, outstanding: 0, overdue: false };
    st.count += 1;
    if (isOutstanding(r)) st.outstanding += Number(r.amount_sek || 0);
    if (effectiveStatus(r) === "overdue") st.overdue = true;
    invoiceStats.set(r.customer_id, st);
  }

  const customers = (data ?? []).filter((c: any) => {
    if (!query) return true;
    return (
      c.name?.toLowerCase().includes(query) ||
      c.contact_person?.toLowerCase().includes(query) ||
      c.industry?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <PageHeader
        title="Kunder"
        subtitle="Kundregister med kontaktuppgifter och status."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="name" />
            <NewCustomerButton />
          </div>
        }
      />

      {/* Search */}
      <form method="GET" className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Sök kunder…"
            className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-4 py-2.5 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-teal-400/40 focus:bg-black/30"
          />
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        </div>
      </form>

      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {customers.map((c: any) => (
          <div key={c.id} className="glass rounded-xl border border-white/10 p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-teal-400/15 text-teal-300 flex items-center justify-center font-bold text-sm shrink-0">
              {c.name?.slice(0, 2).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{c.name}</div>
              <div className="text-xs text-[var(--muted)] truncate">{c.contact_person ?? c.email ?? c.industry ?? "—"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Chip tone={statusTone(c.status)}>{statusLabel(c.status)}</Chip>
                {(!c.org_number || !c.address) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-200 px-2 py-0.5 text-[10px]">
                    <AlertTriangle size={10} /> Saknar avtalsuppgifter
                  </span>
                )}
              </div>
              <InvoiceSummary customerId={c.id} stats={invoiceStats.get(c.id)} />
            </div>
            <EditCustomerButton customer={c} />
          </div>
        ))}
        {customers.length === 0 && (
          <div className="glass rounded-xl border border-white/10 p-8 text-center text-sm text-[var(--muted)]">
            {query ? "Inga kunder matchar sökningen." : "Inga kunder än."}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block glass rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto scroll-x-hint">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Kund</th>
                <th className="p-3">Org.nr / Adress</th>
                <th className="p-3">Kontaktperson</th>
                <th className="p-3">Status</th>
                <th className="p-3">Kontakt</th>
                <th className="p-3">Fakturor</th>
                <th className="p-3 text-right">Åtgärd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="p-3">
                    <div className="font-medium">{c.name}</div>
                    {c.website && (
                      <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-xs text-teal-400 hover:underline">
                        {c.website}
                      </a>
                    )}
                  </td>
                  <td className="p-3 text-[var(--muted)]">
                    {c.org_number || c.address ? (
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="font-mono">{c.org_number ?? "—"}</span>
                        <span className="truncate max-w-[200px]">{c.address ?? "—"}</span>
                        {(!c.org_number || !c.address) && (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertTriangle size={11} /> Ofullständig
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-300 text-xs">
                        <AlertTriangle size={11} /> Saknas (krävs för avtal)
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[var(--muted)]">{c.contact_person ?? "—"}</td>
                  <td className="p-3"><Chip tone={statusTone(c.status)}>{statusLabel(c.status)}</Chip></td>
                  <td className="p-3 text-[var(--muted)]">
                    <div className="flex flex-col gap-0.5">
                      {c.email && <a href={`mailto:${c.email}`} className="text-xs hover:text-white">{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="text-xs hover:text-white">{c.phone}</a>}
                      {!c.email && !c.phone && "—"}
                    </div>
                  </td>
                  <td className="p-3">
                    <InvoiceSummary customerId={c.id} stats={invoiceStats.get(c.id)} />
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <NewInvoiceButton
                        customers={[{ id: c.id, name: c.name }]}
                        preset={{ customerId: c.id }}
                        label="Fakturera"
                        variant="small"
                      />
                      <EditCustomerButton customer={c} />
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                    {query ? "Inga kunder matchar sökningen." : "Inga kunder än."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function InvoiceSummary({
  customerId,
  stats,
}: {
  customerId: string;
  stats?: { count: number; outstanding: number; overdue: boolean };
}) {
  if (!stats) return <span className="text-xs text-[var(--muted)]">—</span>;
  return (
    <Link href={`/admin/invoices?customer=${customerId}`} className="text-xs hover:text-white flex flex-col gap-0.5">
      <span className="text-[var(--muted)]">{stats.count} st</span>
      {stats.outstanding !== 0 ? (
        <span className={`font-mono ${stats.overdue ? "text-rose-300" : "text-sky-300"}`}>
          {fmtAmount(stats.outstanding)} kr obetalt
        </span>
      ) : (
        <span className="text-emerald-300/80">Inget obetalt</span>
      )}
    </Link>
  );
}

function statusTone(s: string | null): any {
  if (s === "active") return "green";
  if (s === "prospect") return "blue";
  if (s === "inactive") return "gray";
  if (s === "closed") return "red";
  return "gray";
}
function statusLabel(s: string | null) {
  if (s === "active") return "Aktiv";
  if (s === "prospect") return "Prospekt";
  if (s === "inactive") return "Inaktiv";
  if (s === "closed") return "Avslutad";
  return s ?? "—";
}

import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { SortSelect } from "@/components/SortSelect";
import { NewAgreementButton } from "./NewAgreementButton";
import { UploadPubTemplateButton } from "./UploadPubTemplateButton";
import { PubTemplateRow } from "./PubTemplateRow";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "date_desc", label: "Nyast först" },
  { value: "date_asc", label: "Äldst först" },
  { value: "status", label: "Status" },
  { value: "customer", label: "Kund (A–Ö)" },
  { value: "number", label: "Avtalsnummer" },
];

export default async function AvtalListPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "date_desc";
  const query = sp.q?.toLowerCase() ?? "";

  const supabase = await createClient();

  const [agreementsRes, offersRes, templatesRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from("agreements")
        .select(
          "id,agreement_number,status,agreement_date,start_date,offer_id,pub_template_id," +
            "customer:customers(id,name)," +
            "offer:offers(id,offer_number,title)," +
            "pub_template:pub_templates(id,name)",
        );
      if (sort === "date_asc") q = q.order("agreement_date", { ascending: true });
      else if (sort === "status") q = q.order("status").order("agreement_date", { ascending: false });
      else if (sort === "number") q = q.order("agreement_number", { ascending: false });
      else if (sort === "customer")
        q = q.order("customer_id", { nullsFirst: false }).order("agreement_date", { ascending: false });
      else q = q.order("agreement_date", { ascending: false });
      return await q;
    })(),
    supabase
      .from("offers")
      .select("id,offer_number,title,offer_date,customer:customers(id,name,org_number,address)")
      .order("offer_date", { ascending: false }),
    supabase
      .from("pub_templates")
      .select("id,name,description,file_name,file_size,is_active,created_at")
      .order("created_at", { ascending: false }),
  ]);

  const agreementsError = agreementsRes.error;
  const templatesError = templatesRes.error;
  const offersError = offersRes.error;

  const allAgreements = agreementsError ? [] : (agreementsRes.data ?? []);
  const agreements = allAgreements.filter((a: any) => {
    if (!query) return true;
    return (
      a.agreement_number?.toLowerCase().includes(query) ||
      a.customer?.name?.toLowerCase().includes(query) ||
      a.offer?.offer_number?.toLowerCase().includes(query) ||
      a.offer?.title?.toLowerCase().includes(query)
    );
  });
  if (sort === "customer") {
    agreements.sort((a: any, b: any) =>
      (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "", "sv"),
    );
  }

  const offers = offersError ? [] : (offersRes.data ?? []);
  const templates = templatesError ? [] : (templatesRes.data ?? []);

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
        title="Avtal"
        subtitle="Skapa avtal från offert + PUB-mall. Ladda ner Avtal+Villkor och PUB-avtal som två PDF:er."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="date_desc" />
            <NewAgreementButton offers={offers as any[]} templates={templates as any[]} />
          </div>
        }
      />

      {agreementsError && (
        <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200 mb-4">
          Det verkar som att <code className="font-mono">agreements</code>-tabellen inte är skapad än.
          Kör migration <code className="font-mono">supabase/migrations/0019_agreements.sql</code> i din Supabase SQL-editor.
        </div>
      )}

      {/* PUB-MALLAR */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-heading text-base font-semibold">PUB-avtalsmallar</h2>
            <p className="text-xs text-[var(--muted)]">
              Ladda upp .docx-mallar med röda platshållare. Mallarna används som bilaga (PUB-avtal) när du skapar ett avtal.
            </p>
          </div>
          <UploadPubTemplateButton />
        </div>
        {templatesError ? (
          <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
            <code className="font-mono">pub_templates</code>-tabellen saknas — kör migration 0019.
          </div>
        ) : templates.length === 0 ? (
          <div className="glass rounded-xl border border-white/10 p-6 text-sm text-[var(--muted)] flex items-center gap-3">
            <FileText size={18} />
            Inga PUB-mallar uppladdade än. Ladda upp en .docx-fil via knappen ovan för att kunna skapa avtal.
          </div>
        ) : (
          <div className="glass rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3">Namn</th>
                  <th className="p-3">Beskrivning</th>
                  <th className="p-3">Fil</th>
                  <th className="p-3">Uppladdad</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {templates.map((t: any) => (
                  <PubTemplateRow key={t.id} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AVTAL */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Avtal</h2>
        </div>

        <form method="GET" className="mb-4">
          <div className="relative max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Sök avtalsnummer, kund, offert…"
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
                  <th className="p-3">Offert</th>
                  <th className="p-3">PUB-mall</th>
                  <th className="p-3">Avtalsdatum</th>
                  <th className="p-3">Startdatum</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {agreements.map((a: any) => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="p-3">
                      <Link
                        href={`/admin/templates/avtal/${a.id}`}
                        className="font-mono text-xs font-semibold hover:text-teal-300"
                      >
                        {a.agreement_number ?? "—"}
                      </Link>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{a.customer?.name ?? "—"}</div>
                    </td>
                    <td className="p-3 text-[var(--muted)] truncate max-w-[200px]">
                      {a.offer?.offer_number ? (
                        <Link
                          href={`/admin/templates/offerter/${a.offer.id}`}
                          className="font-mono text-xs hover:text-teal-300"
                        >
                          {a.offer.offer_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-[var(--muted)] truncate max-w-[200px]">
                      {a.pub_template?.name ?? "—"}
                    </td>
                    <td className="p-3 text-[var(--muted)]">{fmtDate(a.agreement_date)}</td>
                    <td className="p-3 text-[var(--muted)]">{fmtDate(a.start_date)}</td>
                    <td className="p-3">
                      <Chip tone={statusTone(a.status)}>{statusLabel(a.status)}</Chip>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/templates/avtal/${a.id}`}
                        className="text-[var(--muted)] hover:text-white"
                      >
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {agreements.length === 0 && !agreementsError && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-[var(--muted)]">
                      {query
                        ? "Inga avtal matchar sökningen."
                        : templates.length === 0
                          ? "Inga avtal än — börja med att ladda upp en PUB-mall ovan."
                          : "Inga avtal än — skapa ett nytt via knappen ovan."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {agreements.map((a: any) => (
            <Link
              key={a.id}
              href={`/admin/templates/avtal/${a.id}`}
              className="glass rounded-xl border border-white/10 p-4 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">
                    {a.agreement_number ?? "—"}
                  </span>
                  <Chip tone={statusTone(a.status)}>{statusLabel(a.status)}</Chip>
                </div>
                <div className="font-semibold text-sm truncate mt-1">{a.customer?.name ?? "—"}</div>
                <div className="text-xs text-[var(--muted)] truncate">
                  {a.offer?.offer_number ?? "—"} · {a.pub_template?.name ?? "—"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {fmtDate(a.agreement_date)} → {fmtDate(a.start_date)}
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function statusTone(s: string | null): any {
  switch (s) {
    case "signed":
      return "green";
    case "draft":
      return "gray";
    case "terminated":
      return "red";
    default:
      return "gray";
  }
}
function statusLabel(s: string | null) {
  switch (s) {
    case "draft":
      return "Utkast";
    case "signed":
      return "Signerad";
    case "terminated":
      return "Avslutad";
    default:
      return s ?? "—";
  }
}

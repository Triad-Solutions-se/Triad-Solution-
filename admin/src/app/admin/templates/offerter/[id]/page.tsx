import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { OfferEditor } from "./OfferEditor";
import { LINKED_INVOICE_SELECT, LinkedInvoices } from "../../../invoices/LinkedInvoices";
import { LinkedRecurring } from "../../../finance/RecurringIncomeSection";
import { NewAgreementButton } from "../../avtal/NewAgreementButton";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";
import { materializeRecurring } from "@/lib/recurring-data";
import type { RecurringPlan } from "@/lib/recurring";

const AGREEMENT_STATUS: Record<string, { label: string; tone: "gray" | "green" | "red" }> = {
  draft: { label: "Utkast", tone: "gray" },
  signed: { label: "Signerad", tone: "green" },
  terminated: { label: "Avslutad", tone: "red" },
};

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  await materializeRecurring(supabase);

  const [offerRes, customersRes, invoicesRes, agreementsRes, templatesRes] = await Promise.all([
    supabase
      .from("offers")
      .select("*, customer:customers(id,name,contact_person,email,phone,website,org_number,address)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("customers").select("id,name,org_number,address").order("name"),
    supabase
      .from("invoices")
      .select(LINKED_INVOICE_SELECT)
      .eq("offer_id", id)
      .order("issued_at", { ascending: false }),
    supabase
      .from("agreements")
      .select("id,agreement_number,status,start_date")
      .eq("offer_id", id)
      .order("agreement_date", { ascending: false }),
    supabase.from("pub_templates").select("id,name,is_active").order("created_at", { ascending: false }),
  ]);

  const offer = offerRes.data as any;
  if (!offer) notFound();

  const agreements = (agreementsRes.data ?? []) as Array<{
    id: string;
    agreement_number: string | null;
    status: string;
    start_date: string | null;
  }>;
  // Planer kopplade direkt till offerten eller via något av dess avtal. Felar
  // frågan (migration 0036 ej körd) visas ingen panel.
  const plansQuery = supabase.from("recurring_income").select("*").order("created_at");
  const plansRes = await (agreements.length
    ? plansQuery.or(`offer_id.eq.${id},agreement_id.in.(${agreements.map((a) => a.id).join(",")})`)
    : plansQuery.eq("offer_id", id));
  const plans = (plansRes.data ?? []) as RecurringPlan[];
  const customerRef = offer.customer ? { id: offer.customer.id, name: offer.customer.name } : null;

  const customers = (customersRes.data ?? []) as Array<{
    id: string;
    name: string;
    org_number: string | null;
    address: string | null;
  }>;

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/templates/offerter"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Offerter
        </Link>
      </div>

      <OfferEditor
        offer={offer}
        customers={customers}
        aside={
          <>
            <div className="glass rounded-card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Avtal
                </h2>
                {offer.customer && (
                  <NewAgreementButton
                    offers={[{ id: offer.id, offer_number: offer.offer_number, title: offer.title, offer_date: offer.offer_date, customer: offer.customer }]}
                    templates={(templatesRes.data ?? []) as any[]}
                    presetOfferId={offer.id}
                    variant="small"
                  />
                )}
              </div>
              {agreements.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  {offer.customer
                    ? "Inget avtal än. När kunden har accepterat skapar du avtalet härifrån."
                    : "Koppla en kund för att kunna skapa avtal."}
                </p>
              ) : (
                <ul className="divide-y divide-white/5 -my-1">
                  {agreements.map((a) => {
                    const st = AGREEMENT_STATUS[a.status] ?? AGREEMENT_STATUS.draft;
                    return (
                      <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/templates/avtal/${a.id}`}
                            className="font-mono text-xs font-semibold hover:text-teal-300"
                          >
                            {a.agreement_number ?? "Avtal"}
                          </Link>
                          <div className="text-[11px] text-[var(--muted)]">Start {fmtDate(a.start_date)}</div>
                        </div>
                        <Chip tone={st.tone}>{st.label}</Chip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {!plansRes.error && (
              <LinkedRecurring
                plans={plans}
                preset={{
                  customerId: customerRef?.id,
                  ...(agreements[0] ? { agreementId: agreements[0].id } : { offerId: offer.id }),
                }}
                hint="Löpande avgifter faktureras automatiskt när du lägger upp återkommande fakturering — helst från avtalet."
              />
            )}
            {/* Saknas offer_id-kolumnen (migration 0034 ej körd) visas ingen panel. */}
            {invoicesRes.error ? null : (
              <LinkedInvoices
                invoices={(invoicesRes.data ?? []) as any[]}
                customer={customerRef}
                preset={{ offerId: offer.id }}
              />
            )}
          </>
        }
      />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { OfferEditor } from "./OfferEditor";
import { LINKED_INVOICE_SELECT, LinkedInvoices } from "../../../invoices/LinkedInvoices";

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [offerRes, customersRes, invoicesRes] = await Promise.all([
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
  ]);

  const offer = offerRes.data as any;
  if (!offer) notFound();

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
          // Saknas offer_id-kolumnen (migration 0034 ej körd) visas ingen panel.
          invoicesRes.error ? null : (
            <LinkedInvoices
              invoices={(invoicesRes.data ?? []) as any[]}
              customer={offer.customer ? { id: offer.customer.id, name: offer.customer.name } : null}
              preset={{ offerId: offer.id }}
            />
          )
        }
      />
    </>
  );
}

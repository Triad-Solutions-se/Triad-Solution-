import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import type { InvoiceRecord } from "@/lib/invoice";
import { fetchInvoiceSettings } from "@/lib/invoice-data";
import { fetchCompanyInfo } from "../../api/offers/[id]/contract-data";
import { InvoiceEditor } from "./InvoiceEditor";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) notFound();
  const inv = invoice as InvoiceRecord;

  const [customersRes, offersRes, agreementsRes, projectsRes, creditsRes, originalRes, company, { settings }] =
    await Promise.all([
      supabase.from("customers").select("id,name,org_number,address,contact_person,email").order("name"),
      supabase
        .from("offers")
        .select(
          "id,offer_number,title,customer_id,project_items,monthly_items,project_price,monthly_price,project_discount_pct,monthly_discount_pct",
        )
        .order("offer_date", { ascending: false }),
      supabase
        .from("agreements")
        .select("id,agreement_number,customer_id,offer_id")
        .order("agreement_date", { ascending: false }),
      supabase.from("projects").select("id,name,customer_id").order("name"),
      supabase.from("invoices").select("id,number,status").eq("credited_invoice_id", id).order("number"),
      inv.credited_invoice_id
        ? supabase.from("invoices").select("id,number,status,paid_at").eq("id", inv.credited_invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
      fetchCompanyInfo(supabase),
      fetchInvoiceSettings(supabase),
    ]);

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Fakturor
        </Link>
      </div>
      {/* key: duplicera/kreditera navigerar till en ny faktura — editorn måste
          initieras om från den nya radens data. */}
      <InvoiceEditor
        key={inv.id}
        invoice={inv}
        customers={(customersRes.data ?? []) as any[]}
        offers={(offersRes.data ?? []) as any[]}
        agreements={(agreementsRes.data ?? []) as any[]}
        projects={(projectsRes.data ?? []) as any[]}
        credits={(creditsRes.data ?? []) as any[]}
        original={(originalRes.data ?? null) as any}
        company={company}
        settings={settings}
      />
    </>
  );
}

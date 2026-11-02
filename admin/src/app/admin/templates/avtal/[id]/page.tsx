import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { AgreementEditor } from "./AgreementEditor";
import { LINKED_INVOICE_SELECT, LinkedInvoices } from "../../../invoices/LinkedInvoices";
import { agreementGaps } from "../../../api/agreements/[id]/agreement-data";
import { LinkedRecurring } from "../../../finance/RecurringIncomeSection";
import { materializeRecurring } from "@/lib/recurring-data";
import type { RecurringPlan } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  await materializeRecurring(supabase);

  const [agreementRes, templatesRes, offersRes, invoicesRes, plansRes] = await Promise.all([
    supabase
      .from("agreements")
      .select(
        "*," +
          "customer:customers(id,name,contact_person,email,phone,website,org_number,address)," +
          "offer:offers(id,offer_number,title,offer_date)," +
          "pub_template:pub_templates(id,name,file_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("pub_templates")
      .select("id,name,is_active")
      .order("created_at", { ascending: false }),
    supabase
      .from("offers")
      .select("id,offer_number,title,customer:customers(id,name)")
      .order("offer_date", { ascending: false }),
    supabase
      .from("invoices")
      .select(LINKED_INVOICE_SELECT)
      .eq("agreement_id", id)
      .order("issued_at", { ascending: false }),
    supabase.from("recurring_income").select("*").eq("agreement_id", id).order("created_at"),
  ]);

  const agreement = agreementRes.data as any;
  if (!agreement) notFound();
  const missing = await agreementGaps(supabase, agreement);

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/templates/avtal"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Avtal
        </Link>
      </div>
      <AgreementEditor
        agreement={agreement}
        missing={missing}
        templates={(templatesRes.data ?? []) as any[]}
        offers={(offersRes.data ?? []) as any[]}
        invoicesPanel={
          // Saknas agreement_id-kolumnen (migration 0034 ej körd) visas ingen panel.
          invoicesRes.error ? null : (
            <LinkedInvoices
              invoices={(invoicesRes.data ?? []) as any[]}
              customer={agreement.customer ? { id: agreement.customer.id, name: agreement.customer.name } : null}
              preset={{ agreementId: agreement.id }}
            />
          )
        }
        recurringPanel={
          // Saknas agreement_id-kolumnen (migration 0036 ej körd) visas ingen panel.
          plansRes.error ? null : (
            <LinkedRecurring
              plans={(plansRes.data ?? []) as RecurringPlan[]}
              preset={{ customerId: agreement.customer?.id, agreementId: agreement.id }}
              hint="Lägg upp återkommande fakturering så skapas ett fakturautkast för avtalets löpande avgift varje period — månadsvis, kvartalsvis, halvårsvis eller årsvis."
            />
          )
        }
      />
    </>
  );
}

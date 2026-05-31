import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { AgreementEditor } from "./AgreementEditor";

export const dynamic = "force-dynamic";

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [agreementRes, templatesRes, offersRes] = await Promise.all([
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
  ]);

  const agreement = agreementRes.data as any;
  if (!agreement) notFound();

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
        templates={(templatesRes.data ?? []) as any[]}
        offers={(offersRes.data ?? []) as any[]}
      />
    </>
  );
}

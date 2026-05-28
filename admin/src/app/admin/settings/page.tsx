import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CompanySettingsForm } from "./CompanySettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select("name,org_number,address,email,phone,dpo")
    .eq("id", 1)
    .maybeSingle();

  const settings = {
    name: data?.name ?? "Triad Solutions",
    org_number: data?.org_number ?? "",
    address: data?.address ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    dpo: data?.dpo ?? "Ej utsett",
  };

  return (
    <>
      <PageHeader
        title="Inställningar"
        subtitle="Företagsuppgifter som används i offerter, SaaS-avtal och PUB-avtal."
      />
      <CompanySettingsForm settings={settings} />
    </>
  );
}

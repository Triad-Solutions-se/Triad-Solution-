import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CompanySettingsForm } from "./CompanySettingsForm";
import { CapacitySettings } from "./CapacitySettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data }, { data: profiles }, { data: capacity }] = await Promise.all([
    supabase
      .from("company_settings")
      .select("name,org_number,address,email,phone,dpo")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
    supabase.from("member_capacity").select("profile_id,weekly_hours"),
  ]);

  const settings = {
    name: data?.name ?? "Triad Solutions",
    org_number: data?.org_number ?? "",
    address: data?.address ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    dpo: data?.dpo ?? "Ej utsett",
  };

  const hoursById = new Map<string, number>(
    (capacity ?? []).map((c: any) => [c.profile_id, Number(c.weekly_hours) || 0]),
  );
  const members = (profiles ?? []).map((p: any) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? p.id.slice(0, 8),
    weekly_hours: hoursById.get(p.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Inställningar"
        subtitle="Företagsuppgifter som används i offerter, SaaS-avtal och PUB-avtal."
      />
      <div className="space-y-6">
        <CompanySettingsForm settings={settings} />
        <CapacitySettings members={members} />
      </div>
    </>
  );
}

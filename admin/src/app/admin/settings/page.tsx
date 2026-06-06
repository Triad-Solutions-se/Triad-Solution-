import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CompanySettingsForm } from "./CompanySettingsForm";
import { CapacitySettings } from "./CapacitySettings";
import { AiSettings } from "./AiSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data }, { data: profiles }, { data: capacity }] = await Promise.all([
    supabase
      .from("company_settings")
      .select("name,org_number,address,email,phone,dpo,ai_enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
    supabase.from("member_capacity").select("profile_id,weekly_hours,role,skills"),
  ]);

  const settings = {
    name: data?.name ?? "Triad Solutions",
    org_number: data?.org_number ?? "",
    address: data?.address ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    dpo: data?.dpo ?? "Ej utsett",
  };

  const capById = new Map<string, any>(
    (capacity ?? []).map((c: any) => [c.profile_id, c]),
  );
  const members = (profiles ?? []).map((p: any) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? p.id.slice(0, 8),
    weekly_hours: Number(capById.get(p.id)?.weekly_hours) || 0,
    role: capById.get(p.id)?.role ?? "",
    skills: capById.get(p.id)?.skills ?? "",
  }));

  return (
    <>
      <PageHeader
        title="Inställningar"
        subtitle="Företagsuppgifter som används i offerter, SaaS-avtal och PUB-avtal."
      />
      <div className="space-y-6">
        <CompanySettingsForm settings={settings} />
        <AiSettings aiEnabled={data?.ai_enabled === true} />
        <CapacitySettings members={members} />
      </div>
    </>
  );
}

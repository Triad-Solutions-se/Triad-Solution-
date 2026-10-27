import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { fetchInvoiceSettings } from "@/lib/invoice-data";
import { CompanySettingsForm } from "./CompanySettingsForm";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";
import { CapacitySettings } from "./CapacitySettings";
import { AiSettings } from "./AiSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data }, { data: profiles }, { data: capacity }, invoiceSettings] = await Promise.all([
    supabase
      .from("company_settings")
      .select("name,org_number,address,email,phone,dpo,ai_enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("profiles").select("id,display_name,email").order("display_name"),
    supabase.from("member_capacity").select("profile_id,weekly_hours,role,skills"),
    fetchInvoiceSettings(supabase),
  ]);

  const settings = {
    name: data?.name ?? "MCA Solutions AB",
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
        subtitle="Företagsuppgifter som används i offerter, avtal och fakturor."
      />
      <div className="space-y-6">
        <CompanySettingsForm settings={settings} />
        {invoiceSettings.error ? (
          <div className="max-w-2xl glass rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
            Fakturauppgifter (bankgiro, momsreg.nr m.m.) kräver migration{" "}
            <code className="font-mono">supabase/migrations/0034_invoice_system.sql</code>.
          </div>
        ) : (
          <InvoiceSettingsForm settings={invoiceSettings.settings} orgNumber={settings.org_number} />
        )}
        <AiSettings aiEnabled={data?.ai_enabled === true} />
        <CapacitySettings members={members} />
      </div>
    </>
  );
}

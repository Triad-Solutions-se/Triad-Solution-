// Delad data-hämtning för agreement-PDF-routes. Plockar avtal + offert +
// kund + PUB-mall i ett par anrop.

import type { createClient } from "@/lib/supabase/server";
import type { OfferData } from "@/lib/offer-pdf";
import type { CompanyInfo } from "@/lib/company";
import { toCompanyInfo } from "@/lib/company";
import type { Block } from "@/lib/contract-blocks";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AgreementRow = {
  id: string;
  agreement_number: string | null;
  status: string;
  agreement_date: string;
  start_date: string;
  notes: string | null;
  offer_id: string | null;
  pub_template_id: string | null;
  customer_id: string | null;
};

export type PubTemplateRow = {
  id: string;
  name: string;
  extracted_blocks: Block[] | null;
};

export async function fetchCompanyInfo(
  supabase: SupabaseServerClient,
): Promise<CompanyInfo> {
  const { data } = await supabase
    .from("company_settings")
    .select("name,org_number,address,email,phone,dpo")
    .eq("id", 1)
    .maybeSingle();
  return toCompanyInfo(data);
}

export async function fetchAgreement(
  supabase: SupabaseServerClient,
  id: string,
): Promise<{ agreement: AgreementRow | null; error: string | null; status: number }> {
  const { data, error } = await supabase
    .from("agreements")
    .select(
      "id,agreement_number,status,agreement_date,start_date,notes,offer_id,pub_template_id,customer_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { agreement: null, error: error.message, status: 500 };
  if (!data) return { agreement: null, error: "Avtal hittades inte", status: 404 };
  return { agreement: data as AgreementRow, error: null, status: 200 };
}

// Återanvänder samma select som offer-contract route så fält och typer
// matchar OfferData.
const OFFER_SELECT =
  "offer_number,title,reference,offer_date,valid_until,project_description,project_price,monthly_price,project_discount_pct,monthly_discount_pct,other_costs,vat_rate,currency,customer:customers(name,contact_person,email,phone,website,org_number,address)";

export async function fetchOffer(
  supabase: SupabaseServerClient,
  offerId: string,
): Promise<{ offer: OfferData | null; error: string | null }> {
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_SELECT)
    .eq("id", offerId)
    .maybeSingle();
  if (error) return { offer: null, error: error.message };
  if (!data) return { offer: null, error: "Offert hittades inte" };

  const customer = Array.isArray(data.customer)
    ? (data.customer[0] ?? null)
    : ((data.customer as any) ?? null);

  return {
    offer: {
      offer_number: data.offer_number,
      title: data.title,
      reference: data.reference,
      offer_date: data.offer_date,
      valid_until: data.valid_until,
      project_description: data.project_description,
      project_price: Number(data.project_price ?? 0),
      monthly_price: Number(data.monthly_price ?? 0),
      project_discount_pct: Number((data as any).project_discount_pct ?? 0),
      monthly_discount_pct: Number((data as any).monthly_discount_pct ?? 0),
      other_costs: (data as any).other_costs ?? null,
      vat_rate: Number(data.vat_rate ?? 25),
      currency: data.currency ?? "SEK",
      customer,
    },
    error: null,
  };
}

export async function fetchPubTemplate(
  supabase: SupabaseServerClient,
  templateId: string,
): Promise<{ template: PubTemplateRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("pub_templates")
    .select("id,name,extracted_blocks")
    .eq("id", templateId)
    .maybeSingle();
  if (error) return { template: null, error: error.message };
  if (!data) return { template: null, error: "PUB-mall hittades inte" };
  return { template: data as PubTemplateRow, error: null };
}

export async function fetchCustomer(
  supabase: SupabaseServerClient,
  customerId: string,
): Promise<{
  customer: {
    name: string | null;
    org_number: string | null;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("customers")
    .select("name,org_number,contact_person,email,phone,address")
    .eq("id", customerId)
    .maybeSingle();
  if (error) return { customer: null, error: error.message };
  if (!data) return { customer: null, error: "Kund hittades inte" };
  return { customer: data as any, error: null };
}

export function agreementFileBase(
  agreement: AgreementRow,
  customerName: string | null | undefined,
): string {
  const name = customerName ?? "kund";
  const num = agreement.agreement_number ?? agreement.id.slice(0, 8);
  return `${num}_${String(name).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

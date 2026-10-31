// Delad data-hämtning för agreement-PDF-routes. Plockar avtal + offert +
// kund + PUB-mall i ett par anrop.

import type { createClient } from "@/lib/supabase/server";
import type { OfferData } from "@/lib/offer-pdf";
import type { CompanyInfo } from "@/lib/company";
import { toCompanyInfo } from "@/lib/company";
import type { Block } from "@/lib/contract-blocks";
import { fetchOfferForContract } from "../../offers/[id]/contract-data";
import { missingAgreementFields } from "@/lib/agreement-validate";
import { missingPubFields } from "@/lib/pub-template";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AgreementRow = {
  id: string;
  agreement_number: string | null;
  status: string;
  agreement_date: string;
  start_date: string;
  notes: string | null;
  special_terms?: string | null; // saknas tills migration 0035 är körd
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
  // "*" i stället för en kolumnlista så att avtal kan laddas ner även innan
  // migration 0035 (special_terms) är körd.
  const { data, error } = await supabase
    .from("agreements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { agreement: null, error: error.message, status: 500 };
  if (!data) return { agreement: null, error: "Avtal hittades inte", status: 404 };
  return { agreement: data as AgreementRow, error: null, status: 200 };
}

// Samma urval och mappning som offertens egen export (fetchOfferForContract),
// så att avtalet får med alla offertens fält, även de extra
// informationssektionerna.
export async function fetchOffer(
  supabase: SupabaseServerClient,
  offerId: string,
): Promise<{ offer: OfferData | null; error: string | null }> {
  const { offer, error } = await fetchOfferForContract(supabase, offerId);
  return { offer, error };
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
    contact_role?: string | null; // saknas tills migration 0035 är körd
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  error: string | null;
}> {
  // "*" av samma skäl som i fetchAgreement (contact_role kom i 0035).
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  if (error) return { customer: null, error: error.message };
  if (!data) return { customer: null, error: "Kund hittades inte" };
  return { customer: data as any, error: null };
}

// Vad som saknas för avtalet respektive PUB-avtalet. Samma kontroller som
// PDF-routerna gör innan de skapar en PDF; används av avtalssidan för att
// visa listan och låsa nedladdningsknapparna.
export async function agreementGaps(
  supabase: SupabaseServerClient,
  agreement: AgreementRow,
): Promise<{ contract: string[]; pub: string[] }> {
  const [company, offerRes, customerRes, templateRes] = await Promise.all([
    fetchCompanyInfo(supabase),
    agreement.offer_id
      ? fetchOffer(supabase, agreement.offer_id)
      : Promise.resolve({ offer: null, error: null }),
    agreement.customer_id
      ? fetchCustomer(supabase, agreement.customer_id)
      : Promise.resolve({ customer: null, error: null }),
    agreement.pub_template_id
      ? fetchPubTemplate(supabase, agreement.pub_template_id)
      : Promise.resolve({ template: null, error: null }),
  ]);

  const contract = missingAgreementFields({ offer: offerRes.offer, company, agreement });

  const pub: string[] = [];
  const blocks = templateRes.template?.extracted_blocks;
  if (!agreement.pub_template_id) pub.push("PUB-mall (välj en PUB-mall på avtalet)");
  else if (!blocks || blocks.length === 0) pub.push("PUB-mallens innehåll (ladda upp mallen på nytt)");
  if (!customerRes.customer) pub.push("Kund (avtalet saknar kund)");
  if (blocks && blocks.length > 0 && customerRes.customer) {
    pub.push(
      ...missingPubFields(blocks, {
        customer: customerRes.customer,
        company,
        agreementDate: agreement.agreement_date,
        startDate: agreement.start_date,
        offerNumber: offerRes.offer?.offer_number ?? null,
        agreementNumber: agreement.agreement_number ?? null,
      }),
    );
  }
  return { contract, pub };
}

export function agreementFileBase(
  agreement: AgreementRow,
  customerName: string | null | undefined,
): string {
  const name = customerName ?? "kund";
  const num = agreement.agreement_number ?? agreement.id.slice(0, 8);
  return `${num}_${String(name).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

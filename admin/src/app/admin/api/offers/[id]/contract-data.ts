import type { createClient } from "@/lib/supabase/server";
import type { OfferData } from "@/lib/offer-pdf";
import { type CompanyInfo, toCompanyInfo } from "@/lib/company";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Hämtar leverantörens (Triad) företagsuppgifter från company_settings.
// Faller tillbaka på defaults om raden saknas.
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

const SELECT =
  "offer_number,title,reference,offer_date,valid_until,project_description,project_price,monthly_price,project_discount_pct,monthly_discount_pct,other_costs,vat_rate,currency,customer:customers(name,contact_person,email,phone,website,org_number,address)";

// Hämtar en offert + kund i den form som offert-/avtalsgeneratorerna förväntar.
// Delas av PDF- och PUB-routerna så att urval och mappning hålls i synk.
export async function fetchOfferForContract(
  supabase: SupabaseServerClient,
  id: string,
): Promise<{ offer: OfferData | null; error: string | null; status: number }> {
  const { data: offer, error } = await supabase
    .from("offers")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return { offer: null, error: error.message, status: 500 };
  if (!offer) return { offer: null, error: "Offert hittades inte", status: 404 };

  const customer = Array.isArray(offer.customer)
    ? offer.customer[0] ?? null
    : ((offer.customer as any) ?? null);

  return {
    offer: {
      offer_number: offer.offer_number,
      title: offer.title,
      reference: offer.reference,
      offer_date: offer.offer_date,
      valid_until: offer.valid_until,
      project_description: offer.project_description,
      project_price: Number(offer.project_price ?? 0),
      monthly_price: Number(offer.monthly_price ?? 0),
      project_discount_pct: Number((offer as any).project_discount_pct ?? 0),
      monthly_discount_pct: Number((offer as any).monthly_discount_pct ?? 0),
      other_costs: (offer as any).other_costs ?? null,
      vat_rate: Number(offer.vat_rate ?? 25),
      currency: offer.currency ?? "SEK",
      customer,
    },
    error: null,
    status: 200,
  };
}

// "2026-001_Kundnamn" eller "abcd1234_kund" som filnamnsbas.
export function offerFileBase(offer: OfferData, id: string): string {
  const name = offer.customer?.name ?? "kund";
  return `${offer.offer_number ?? id.slice(0, 8)}_${String(name).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

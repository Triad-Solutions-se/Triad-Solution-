// Vilka uppgifter som måste finnas innan avtals-PDF:en (Avtal + Villkor +
// ev. Bilaga 1) får skapas. PUB-avtalets motsvarighet ligger i
// pub-template.ts (missingPubFields), eftersom den utgår från mallens
// platshållare. Används av PDF-routerna (som vägrar) och av avtalssidan (som
// visar vad som saknas).
//
// Ren fil utan server-beroenden.

import type { CompanyInfo } from "./company";
import { missingContractFields, type ContractOfferInput } from "./offer-validate";

// Röd platshållare i mallarna: [VERSALER …], t.ex. [ORG.NR] eller [DATUM].
export const PLACEHOLDER_RE = /\[[A-ZÅÄÖ][^\]\n]*\]/g;

export function findPlaceholders(text: string): string[] {
  return text.match(PLACEHOLDER_RE) ?? [];
}

export type AgreementCheckInput = {
  offer:
    | (ContractOfferInput & {
        project_description?: string | null;
        project_price?: number | null;
        monthly_price?: number | null;
        project_items?: unknown[] | null;
        monthly_items?: unknown[] | null;
      })
    | null;
  company: CompanyInfo;
  agreement: {
    agreement_date: string | null;
    start_date: string | null;
    special_terms?: string | null;
  };
};

// Tom lista = avtalet kan skapas.
export function missingAgreementFields(x: AgreementCheckInput): string[] {
  const missing: string[] = [];
  const o = x.offer;
  if (!o) {
    missing.push("Offert (välj en offert på avtalet)");
  } else {
    missing.push(...missingContractFields(o));
    if (!o.project_description?.trim()) missing.push("Projektbeskrivning (offerten)");
    const hasPrices =
      (o.project_items?.length ?? 0) > 0 ||
      (o.monthly_items?.length ?? 0) > 0 ||
      Number(o.project_price ?? 0) > 0 ||
      Number(o.monthly_price ?? 0) > 0;
    if (!hasPrices) missing.push("Priser (offerten)");
  }
  if (!x.company.orgNumber) missing.push("Leverantörens organisationsnummer (Inställningar)");
  if (!x.company.address) missing.push("Leverantörens adress (Inställningar)");
  if (!x.agreement.agreement_date) missing.push("Avtalsdatum");
  if (!x.agreement.start_date) missing.push("Avtalsstart");
  for (const ph of new Set(findPlaceholders(x.agreement.special_terms ?? ""))) {
    missing.push(`Platshållaren ${ph} i Bilaga 1`);
  }
  return missing;
}

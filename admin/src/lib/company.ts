// Leverantörens (Triad Solutions) företagsuppgifter. Redigeras i portalen under
// Inställningar och lagras i tabellen `company_settings` (singleton, id = 1).
// Används som "Leverantör" i SaaS-avtalet, "Personuppgiftsbiträde" i PUB-avtalet
// och i offertens FRÅN-block.
//
// Denna fil är ren (inga server-beroenden) så den kan importeras var som helst.
// Själva DB-hämtningen sker via fetchCompanyInfo() i API-routerna.

export type CompanyInfo = {
  name: string;
  orgNumber: string;
  address: string;
  email: string;
  phone: string;
  dpo: string;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "Triad Solutions",
  orgNumber: "",
  address: "",
  email: "info@triadsolutions.se",
  phone: "",
  dpo: "Ej utsett",
};

// Mappar en rad från `company_settings` till CompanyInfo, med defaults för
// saknade/null-fält.
export function toCompanyInfo(row: Record<string, any> | null | undefined): CompanyInfo {
  if (!row) return { ...DEFAULT_COMPANY };
  return {
    name: row.name?.trim() || DEFAULT_COMPANY.name,
    orgNumber: row.org_number?.trim() || "",
    address: row.address?.trim() || "",
    email: row.email?.trim() || DEFAULT_COMPANY.email,
    phone: row.phone?.trim() || "",
    dpo: row.dpo?.trim() || DEFAULT_COMPANY.dpo,
  };
}

// "Gatuadress, Postnr Ort" på en rad (kollapsar ev. radbrytningar).
export function companyAddressLine(c: CompanyInfo): string {
  return (c.address || "").replace(/\s*\n\s*/g, ", ").trim();
}

// Rader för FRÅN-blocket i offerten (utan företagsnamnet, som ritas separat).
export function companyFromLines(c: CompanyInfo): string[] {
  const lines: string[] = [];
  if (c.orgNumber) lines.push(`Organisationsnummer: ${c.orgNumber}`);
  for (const part of (c.address || "").split(/\r?\n/)) {
    if (part.trim()) lines.push(part.trim());
  }
  if (c.email) lines.push(c.email);
  if (c.phone) lines.push(c.phone);
  return lines;
}

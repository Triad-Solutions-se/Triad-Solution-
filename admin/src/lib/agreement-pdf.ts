// Avtal-PDF: Avtals-försättet (offert-layout, rebrandad som AVTAL) + Villkor
// (från villkor.ts) i samma PDF. Villkor börjar på en ny sida med försättsblad.

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4_W,
  A4_H,
  Pdf,
  loadLogo,
  drawOfferContent,
  type OfferData,
} from "./offer-pdf";
import { renderBlocks, drawContractCover } from "./contract-blocks";
import { villkorBlocks, buildVillkorCtx } from "./villkor";
import type { CompanyInfo } from "./company";

export type AgreementMeta = {
  agreementNumber: string | null;
  agreementDate: string; // ISO
  startDate: string; // ISO
};

export async function generateAgreementPdf(
  offer: OfferData,
  meta: AgreementMeta,
  company: CompanyInfo,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = `Avtal ${meta.agreementNumber ?? offer.offer_number ?? ""}`.trim();
  doc.setTitle(title);
  doc.setAuthor(company.name);
  doc.setCreator("Triad Admin");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([A4_W, A4_H]);
  const p = new Pdf(doc, page, font, fontBold, fontItalic);
  const logo = await loadLogo(doc);

  // === 1. Avtals-försätt (offert-layout med AVTAL-rubrik & avtals-boxar) ===
  drawOfferContent(p, offer, logo, company, {
    kind: "agreement",
    agreementNumber: meta.agreementNumber,
    agreementDate: meta.agreementDate,
    startDate: meta.startDate,
  });

  // === 2. Villkor på ny sida med försättsblad ===
  p.newPage();
  drawContractCover(p, logo, "AVTAL", "VILLKOR", "Bilaga till avtalet");
  const ctx = buildVillkorCtx(
    offer.customer ?? null,
    meta.agreementDate,
    meta.startDate,
  );
  renderBlocks(p, villkorBlocks(ctx, company));

  return await doc.save();
}

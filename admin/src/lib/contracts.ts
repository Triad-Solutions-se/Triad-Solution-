// Genererar ren offert-PDF. SaaS-avtal och PUB-avtal hanteras numera i
// Avtal-flödet (agreement-pdf.ts / pub-template.ts).

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4_W,
  A4_H,
  Pdf,
  loadLogo,
  drawOfferContent,
  type OfferData,
} from "./offer-pdf";
import { CompanyInfo } from "./company";

async function newDoc(title: string, author: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("Triad Admin");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([A4_W, A4_H]);
  const p = new Pdf(doc, page, font, fontBold, fontItalic);
  return { doc, p };
}

// Ren offert-PDF (utan SaaS-avtal, PUB-avtal eller andra bilagor).
export async function generateOfferPdf(
  offer: OfferData,
  company: CompanyInfo,
): Promise<Uint8Array> {
  const { doc, p } = await newDoc(`Offert ${offer.offer_number ?? ""}`.trim(), company.name);
  const logo = await loadLogo(doc);
  drawOfferContent(p, offer, logo, company);
  return await doc.save();
}

// GET /admin/api/agreements/[id]/contract — Avtal + Villkor som en PDF.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAgreementPdf } from "@/lib/agreement-pdf";
import { missingContractFields } from "@/lib/offer-validate";
import {
  agreementFileBase,
  fetchAgreement,
  fetchCompanyInfo,
  fetchOffer,
} from "../agreement-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { agreement, error, status } = await fetchAgreement(supabase, id);
  if (!agreement) return NextResponse.json({ error }, { status });

  if (!agreement.offer_id) {
    return NextResponse.json(
      { error: "Avtalet saknar koppling till en offert." },
      { status: 400 },
    );
  }

  const { offer, error: offerError } = await fetchOffer(supabase, agreement.offer_id);
  if (!offer) {
    return NextResponse.json(
      { error: offerError ?? "Offerten kunde inte hämtas." },
      { status: 500 },
    );
  }

  const missing = missingContractFields(offer);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Offerten saknar obligatoriska fält för avtal: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const company = await fetchCompanyInfo(supabase);

  const buffer = await generateAgreementPdf(
    offer,
    {
      agreementNumber: agreement.agreement_number,
      agreementDate: agreement.agreement_date,
      startDate: agreement.start_date,
    },
    company,
  );

  const filename = `Avtal_${agreementFileBase(agreement, offer.customer?.name)}.pdf`;
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/pdf",
  });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

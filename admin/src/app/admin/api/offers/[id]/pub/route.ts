import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePubPdf } from "@/lib/contracts";
import { fetchOfferForContract, fetchCompanyInfo, offerFileBase } from "../contract-data";
import { missingContractFields } from "@/lib/offer-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { offer, error, status } = await fetchOfferForContract(supabase, id);
  if (!offer) return NextResponse.json({ error }, { status });

  const missing = missingContractFields(offer);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Offerten saknar obligatoriska fält för avtal: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const company = await fetchCompanyInfo(supabase);
  const buffer = await generatePubPdf(offer, company);
  const filename = `PUB-avtal_${offerFileBase(offer, id)}.pdf`;

  const blob = new Blob([buffer as unknown as BlobPart], { type: "application/pdf" });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

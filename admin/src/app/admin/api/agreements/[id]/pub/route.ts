// GET /admin/api/agreements/[id]/pub — PUB-avtal som separat PDF, baserat på
// den valda PUB-mallens extracted_blocks med röda platshållare substituerade.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePubFromTemplatePdf } from "@/lib/pub-template";
import {
  agreementFileBase,
  fetchAgreement,
  fetchCompanyInfo,
  fetchCustomer,
  fetchOffer,
  fetchPubTemplate,
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

  if (!agreement.pub_template_id) {
    return NextResponse.json(
      { error: "Avtalet saknar koppling till en PUB-mall." },
      { status: 400 },
    );
  }
  if (!agreement.customer_id) {
    return NextResponse.json(
      { error: "Avtalet saknar koppling till en kund." },
      { status: 400 },
    );
  }

  const [companyInfo, templateRes, customerRes, offerRes] = await Promise.all([
    fetchCompanyInfo(supabase),
    fetchPubTemplate(supabase, agreement.pub_template_id),
    fetchCustomer(supabase, agreement.customer_id),
    agreement.offer_id
      ? fetchOffer(supabase, agreement.offer_id)
      : Promise.resolve({ offer: null, error: null }),
  ]);

  if (!templateRes.template) {
    return NextResponse.json(
      { error: templateRes.error ?? "PUB-mall kunde inte hämtas." },
      { status: 500 },
    );
  }
  if (!customerRes.customer) {
    return NextResponse.json(
      { error: customerRes.error ?? "Kund kunde inte hämtas." },
      { status: 500 },
    );
  }

  const blocks = templateRes.template.extracted_blocks;
  if (!blocks || blocks.length === 0) {
    return NextResponse.json(
      {
        error:
          "PUB-mallen saknar parsad innehållsstruktur. Ladda upp mallen på nytt så att den parsas korrekt.",
      },
      { status: 500 },
    );
  }

  const buffer = await generatePubFromTemplatePdf(
    blocks,
    {
      customer: customerRes.customer,
      company: companyInfo,
      agreementDate: agreement.agreement_date,
      startDate: agreement.start_date,
      offerNumber: offerRes.offer?.offer_number ?? null,
    },
    templateRes.template.name,
  );

  const filename = `PUB-avtal_${agreementFileBase(agreement, customerRes.customer.name)}.pdf`;
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

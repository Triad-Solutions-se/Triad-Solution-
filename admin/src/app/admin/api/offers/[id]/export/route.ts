import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOfferXlsx } from "@/lib/offer-xlsx";
import { normalizeItems } from "@/lib/offer-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select(
      "offer_number,title,reference,offer_date,valid_until,project_description,custom_header,custom_text,project_price,monthly_price,project_discount_pct,monthly_discount_pct,project_items,monthly_items,other_costs,vat_rate,currency,customer:customers(name,contact_person,email,phone,website)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!offer) {
    return NextResponse.json({ error: "Offert hittades inte" }, { status: 404 });
  }

  const buffer = await generateOfferXlsx({
    offer_number: offer.offer_number,
    title: offer.title,
    reference: offer.reference,
    offer_date: offer.offer_date,
    valid_until: offer.valid_until,
    project_description: offer.project_description,
    custom_header: (offer as any).custom_header ?? null,
    custom_text: (offer as any).custom_text ?? null,
    project_price: Number(offer.project_price ?? 0),
    monthly_price: Number(offer.monthly_price ?? 0),
    project_discount_pct: Number((offer as any).project_discount_pct ?? 0),
    monthly_discount_pct: Number((offer as any).monthly_discount_pct ?? 0),
    project_items: normalizeItems((offer as any).project_items),
    monthly_items: normalizeItems((offer as any).monthly_items),
    other_costs: (offer as any).other_costs ?? null,
    vat_rate: Number(offer.vat_rate ?? 25),
    currency: offer.currency ?? "SEK",
    // Supabase nested embed returns either object or array depending on relation cardinality
    customer: Array.isArray(offer.customer) ? offer.customer[0] ?? null : (offer.customer as any) ?? null,
  });

  const safeName = (offer.customer && (Array.isArray(offer.customer) ? offer.customer[0]?.name : (offer.customer as any).name)) ?? "kund";
  const filename = `Offert_${offer.offer_number ?? id.slice(0, 8)}_${String(safeName).replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;

  // Wrap in Blob to satisfy NextResponse's BodyInit typing on Node 22+ where
  // Uint8Array<ArrayBufferLike> isn't accepted directly. Cast handles the
  // ArrayBufferLike vs ArrayBuffer narrowing — runtime works fine.
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

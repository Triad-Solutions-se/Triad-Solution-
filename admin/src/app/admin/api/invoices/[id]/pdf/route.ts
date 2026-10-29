import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { fetchInvoiceForPdf, fetchInvoiceSettings } from "@/lib/invoice-data";
import { fetchCompanyInfo } from "../../../offers/[id]/contract-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /admin/api/invoices/[id]/pdf — visar fakturan inline (förhandsgranskning
// i ny flik); ?download=1 ger en nedladdning.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { invoice, customerName, error, status } = await fetchInvoiceForPdf(supabase, id);
  if (!invoice) return NextResponse.json({ error }, { status });

  const [company, { settings }] = await Promise.all([
    fetchCompanyInfo(supabase),
    fetchInvoiceSettings(supabase),
  ]);
  const buffer = await generateInvoicePdf(invoice, company, settings);

  const prefix = invoice.isCredit ? "Kreditfaktura" : "Faktura";
  const safeName = (customerName || "kund").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${prefix}_${invoice.number}_${safeName}.pdf`;
  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";

  const blob = new Blob([buffer as unknown as BlobPart], { type: "application/pdf" });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendInvoiceEmail } from "@/lib/invoice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /admin/api/invoices/[id]/send { to?: string } — mejlar fakturan som PDF.
// Ett utkast kontrolleras och markeras som skickat när mejlet har gått iväg.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const supabase = await createClient();
  const result = await sendInvoiceEmail(supabase, id, { to: body.to?.trim() || null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, to: result.to });
}

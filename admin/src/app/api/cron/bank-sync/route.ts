import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enableBankingConfigured } from "@/lib/enable-banking";
import { syncAllConnections } from "@/lib/bank-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/bank-sync — daglig synk av bankkopplingarna (Vercel Cron, se
// vercel.json). Vercel skickar "Authorization: Bearer $CRON_SECRET". Utan
// hemligheten svarar vi 401: bankerna tillåter bara ett fåtal hämtningar per
// dygn utan att användaren är närvarande, så synken får inte vara öppen.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!enableBankingConfigured()) {
    return NextResponse.json({ skipped: "Enable Banking är inte konfigurerat" });
  }
  const results = await syncAllConnections(createAdminClient());
  return NextResponse.json({ results });
}

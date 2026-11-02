import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enableBankingConfigured } from "@/lib/enable-banking";
import { syncAllConnections } from "@/lib/bank-sync";
import { errorMessage, psuFrom, requireMember } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /admin/api/bank/sync — "Synka nu": hämtar saldo och transaktioner för
// alla aktiva bankkopplingar.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  if (!enableBankingConfigured()) {
    return NextResponse.json({ error: "Enable Banking är inte konfigurerat." }, { status: 503 });
  }
  try {
    const results = await syncAllConnections(createAdminClient(), psuFrom(req));
    const failed = results.find((r) => r.error);
    return NextResponse.json({ results, error: failed?.error ?? null });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

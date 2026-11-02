import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enableBankingConfigured, startAuthorization } from "@/lib/enable-banking";
import { resolveAspsp } from "@/lib/bank-sync";
import { errorMessage, psuFrom, requireMember } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /admin/api/bank/connect — startar BankID-medgivandet hos banken.
// Body: { bankAccountId?: string } — kontot man klickade "Koppla bank" på.
// Svar: { url } som webbläsaren skickas till; banken skickar sedan tillbaka
// användaren till /admin/api/bank/callback.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  if (!enableBankingConfigured()) {
    return NextResponse.json(
      { error: "Enable Banking är inte konfigurerat (ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY saknas)." },
      { status: 503 },
    );
  }

  let body: { bankAccountId?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const admin = createAdminClient();
  try {
    const { aspsp, psuType, validUntil } = await resolveAspsp();
    const state = randomUUID();

    // Påbörjade kopplingar som aldrig slutfördes.
    await admin
      .from("bank_connections")
      .delete()
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 3600_000).toISOString());

    const { error } = await admin.from("bank_connections").insert({
      aspsp_name: aspsp.name,
      aspsp_country: aspsp.country,
      psu_type: psuType,
      status: "pending",
      auth_state: state,
      target_bank_account_id: body.bankAccountId || null,
      valid_until: validUntil.toISOString(),
      created_by: user.id,
    });
    if (error) throw new Error(error.message);

    const { url } = await startAuthorization({
      aspsp,
      psuType,
      state,
      validUntil,
      redirectUrl:
        process.env.ENABLE_BANKING_REDIRECT_URL || `${req.nextUrl.origin}/admin/api/bank/callback`,
      psu: psuFrom(req),
    });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeSession } from "@/lib/enable-banking";
import {
  linkSessionAccounts,
  retireOlderConnections,
  syncConnection,
  type BankConnection,
} from "@/lib/bank-sync";
import { errorMessage, psuFrom, requireMember } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /admin/api/bank/callback?code=…&state=… (eller ?error=…) — hit skickar
// Enable Banking tillbaka användaren efter BankID. Skapar sessionen, knyter
// kontona till portalens bankkonton, kör en första synk och går till Ekonomi.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const back = (q: Record<string, string>) =>
    NextResponse.redirect(new URL(`/admin/finance?${new URLSearchParams(q)}`, req.nextUrl.origin));

  const user = await requireMember();
  if (!user) return back({ bank: "error", message: "Ej inloggad" });

  const state = sp.get("state");
  if (!state) return back({ bank: "error", message: "Svaret från banken saknar state." });

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("bank_connections")
    .select("id,aspsp_name,aspsp_country,status,session_id,target_bank_account_id,valid_until")
    .eq("auth_state", state)
    .eq("status", "pending")
    .maybeSingle();
  if (!pending) {
    return back({ bank: "error", message: "Kopplingen hittades inte eller är redan använd. Försök igen." });
  }

  const code = sp.get("code");
  if (!code) {
    await admin.from("bank_connections").delete().eq("id", pending.id);
    const reason = sp.get("error_description") || sp.get("error") || "Ingen kod från banken.";
    return back({ bank: "error", message: `Kopplingen avbröts: ${reason}` });
  }

  const psu = psuFrom(req);
  try {
    const session = await authorizeSession(code, psu);
    const conn: BankConnection = {
      ...(pending as BankConnection),
      status: "active",
      session_id: session.session_id,
      valid_until: session.access?.valid_until ?? pending.valid_until,
    };
    const { error } = await admin
      .from("bank_connections")
      .update({
        status: "active",
        session_id: conn.session_id,
        valid_until: conn.valid_until,
        auth_state: null,
        last_error: null,
      })
      .eq("id", conn.id);
    if (error) throw new Error(error.message);

    const linked = await linkSessionAccounts(admin, conn, session.accounts ?? []);
    await retireOlderConnections(admin, conn);
    const sync = await syncConnection(admin, conn, psu);

    return back({
      bank: "connected",
      accounts: String(linked.length),
      ...(sync.error ? { message: `Kopplad, men första synken misslyckades: ${sync.error}` } : {}),
    });
  } catch (e) {
    await admin
      .from("bank_connections")
      .update({ status: "error", auth_state: null, last_error: errorMessage(e) })
      .eq("id", pending.id);
    return back({ bank: "error", message: errorMessage(e) });
  }
}

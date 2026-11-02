import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteSession } from "@/lib/enable-banking";
import { errorMessage, requireMember } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /admin/api/bank/connections/[id] — "Koppla från": stänger
// medgivandet hos banken. Kontona och transaktionerna finns kvar; saldot
// räknas åter fram från portalens egna poster.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { id } = await params;

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("bank_connections")
    .select("id,status,session_id")
    .eq("id", id)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: "Kopplingen finns inte" }, { status: 404 });

  try {
    if (conn.status === "active" && conn.session_id) {
      await deleteSession(conn.session_id).catch(() => {});
    }
    const { error: accErr } = await admin
      .from("bank_accounts")
      .update({ connection_id: null, provider_account_uid: null })
      .eq("connection_id", id);
    if (accErr) throw new Error(accErr.message);
    const { error } = await admin
      .from("bank_connections")
      .update({ status: "revoked", last_error: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

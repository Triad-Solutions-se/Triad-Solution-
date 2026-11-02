import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyMatch, dismissMatch } from "@/lib/bank-match-data";
import { errorMessage, requireMember } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /admin/api/bank/matches — { action, transactionId, invoiceId }
//   action "apply"   = "Markera som betald": inbetalningen betalade fakturan.
//   action "dismiss" = avfärda förslaget, så att det inte visas eller kopplas igen.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { action, transactionId, invoiceId } = body as Record<string, unknown>;
  if (
    (action !== "apply" && action !== "dismiss") ||
    typeof transactionId !== "string" ||
    typeof invoiceId !== "string" ||
    !UUID.test(transactionId) ||
    !UUID.test(invoiceId)
  ) {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    if (action === "apply") {
      const id = await applyMatch(admin, transactionId, invoiceId, user.id);
      return NextResponse.json({ id });
    }
    await dismissMatch(admin, transactionId, invoiceId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

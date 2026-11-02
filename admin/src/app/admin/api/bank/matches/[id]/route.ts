import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { undoMatch } from "@/lib/bank-match-data";
import { errorMessage, requireMember } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /admin/api/bank/matches/[id] — ångra en koppling: fakturan blir
// obetald igen och paret kopplas inte automatiskt nästa gång banken synkas.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { id } = await params;
  try {
    await undoMatch(createAdminClient(), id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

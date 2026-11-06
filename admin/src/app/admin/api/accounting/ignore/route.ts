import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage, requireMember } from "../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = /^[a-z-]+:[0-9A-Za-z-]+$/;

// POST /admin/api/accounting/ignore — { key, note? } hoppar över en post i kön,
// t.ex. en transaktion som redan är bokförd någon annanstans.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.key !== "string" || !KEY.test(body.key)) {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }
  const { error } = await createAdminClient().rpc("accounting_ignore", {
    p_key: body.key,
    p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    p_user: user.id,
  });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true });
}

// DELETE /admin/api/accounting/ignore — { key } lägger tillbaka posten i kön.
export async function DELETE(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.key !== "string" || !KEY.test(body.key)) {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }
  const { error } = await createAdminClient().rpc("accounting_unignore", { p_key: body.key, p_user: user.id });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true });
}

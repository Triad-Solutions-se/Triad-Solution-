import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ISO_DATE } from "@/lib/accounting/approve";
import { sanitizeLines } from "@/lib/accounting/core";
import { errorMessage, requireMember } from "../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /admin/api/accounting/entries — manuell verifikation, t.ex. ingående balans,
// lön, periodisering eller bokslutspost: { date, description, lines, attachment_path? }.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (typeof body?.date !== "string" || !ISO_DATE.test(body.date)) throw new Error("Ange ett datum.");
    if (typeof body?.description !== "string" || !body.description.trim()) throw new Error("Ange en text.");
    const lines = sanitizeLines(body.lines);
    const attachment =
      typeof body.attachment_path === "string" && body.attachment_path.startsWith("verifikat/")
        ? body.attachment_path
        : null;
    const { data, error } = await createAdminClient().rpc("accounting_post_entry", {
      p_date: body.date,
      p_description: body.description.slice(0, 300),
      p_lines: lines,
      p_attachment: attachment,
      p_user: user.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

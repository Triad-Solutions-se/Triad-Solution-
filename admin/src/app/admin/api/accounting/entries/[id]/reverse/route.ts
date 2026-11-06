import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ISO_DATE } from "@/lib/accounting/approve";
import { errorMessage, requireMember } from "../../../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// POST /admin/api/accounting/entries/[id]/reverse — { date? } skapar en rättelse med
// omvända rader. Utan datum: originalets datum, eller första öppna dag om perioden
// är låst. Underlaget kommer tillbaka i kön och kan bokföras rätt.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const admin = createAdminClient();
    let date = typeof body?.date === "string" && ISO_DATE.test(body.date) ? (body.date as string) : null;
    if (!date) {
      const [{ data: entry, error: entryError }, { data: settings }] = await Promise.all([
        admin.from("journal_entries").select("date").eq("id", id).maybeSingle(),
        admin.from("accounting_settings").select("locked_through").eq("id", 1).maybeSingle(),
      ]);
      if (entryError) throw new Error(entryError.message);
      if (!entry) throw new Error("Verifikationen finns inte.");
      const locked = settings?.locked_through as string | null | undefined;
      date = locked && entry.date <= locked ? nextDay(locked) : (entry.date as string);
    }
    const { data, error } = await admin.rpc("accounting_reverse_entry", {
      p_entry: id,
      p_date: date,
      p_user: user.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

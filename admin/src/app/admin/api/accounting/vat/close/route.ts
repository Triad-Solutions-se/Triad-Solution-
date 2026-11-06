import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueue } from "@/lib/accounting/data";
import { vatClosingLines, vatReport } from "@/lib/accounting/reports";
import { errorMessage, requireMember } from "../../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /admin/api/accounting/vat/close — { periodId } bokför momsavslutet: periodens
// momskonton nollas mot 2650 (ören på 3740) och perioden låses i samma transaktion.
// Inget skickas till Skatteverket: deklarationen lämnas där med rutorna från sidan.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const admin = createAdminClient();
    const queue = await loadQueue(admin);
    if (!queue) throw new Error("Migration 0044 är inte körd.");
    const period = queue.periods.find((p) => p.id === body?.periodId);
    if (!period) throw new Error("Perioden finns inte.");
    if (period.to >= queue.today) throw new Error("Perioden är inte slut än.");

    const isClosed = (id: string) => queue.decisions.some((d) => d.source_key === `vat-close:${id}`);
    if (isClosed(period.id)) throw new Error("Perioden är redan redovisad.");
    // En stängd period låser allt före sig, så äldre perioder måste tas först.
    const earlier = queue.periods.find((p) => p.to < period.to && !isClosed(p.id));
    if (earlier) throw new Error(`Redovisa ${earlier.label} först.`);

    const report = vatReport(queue.ledger.posted, queue.accounts, queue.ledger.closingIds, period.from, period.to);
    const lines = vatClosingLines(report);
    const key = `vat-close:${period.id}`;

    // Ingen moms i perioden: ingen verifikation, men perioden markeras och låses.
    if (lines.length < 2) {
      const { error: decisionError } = await admin
        .from("accounting_decisions")
        .insert({ source_key: key, decision: "booked", note: "Ingen moms i perioden", decided_by: user.id });
      if (decisionError) throw new Error(decisionError.message);
      const locked = queue.settings.locked_through;
      const { error: lockError } = await admin
        .from("accounting_settings")
        .update({ locked_through: !locked || locked < period.to ? period.to : locked, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (lockError) throw new Error(lockError.message);
      await admin
        .from("accounting_log")
        .insert({ action: "vat-close-empty", source_key: key, detail: { period: period.id }, actor: user.id });
      return NextResponse.json({ ok: true, box49: 0, entry: null });
    }

    const { data, error } = await admin.rpc("accounting_post_entry", {
      p_date: period.to,
      p_description: `Momsredovisning ${period.label}`,
      p_lines: lines,
      p_source_key: key,
      p_lock_through: period.to,
      p_user: user.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, box49: report.box49, entry: data });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

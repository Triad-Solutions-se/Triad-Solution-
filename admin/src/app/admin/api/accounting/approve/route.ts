import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ApproveInput, approveProposal } from "@/lib/accounting/approve";
import { loadQueue } from "@/lib/accounting/data";
import { errorMessage, requireMember } from "../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;

// POST /admin/api/accounting/approve — { items: [{ key, date, description, lines, vat }] }
// Kön räknas om på servern: bara poster som fortfarande finns i kön kan bokföras.
// Varje post bokförs för sig, så att ett fel inte stoppar resten vid "Godkänn markerade".
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const items = body?.items as ApproveInput[] | undefined;
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const queue = await loadQueue(admin);
    if (!queue) return NextResponse.json({ error: "Migration 0044 är inte körd." }, { status: 409 });
    const results = [];
    for (const item of items) {
      const proposal = typeof item?.key === "string" ? queue.byKey.get(item.key) : undefined;
      if (!proposal) {
        results.push({ key: item?.key, ok: false, error: "Posten finns inte längre i kön. Ladda om sidan." });
        continue;
      }
      try {
        const transaction = queue.transactions.find((t) => t.id === proposal.transactionId) ?? null;
        const entry = await approveProposal(admin, proposal, item, transaction, user.id);
        results.push({ key: item.key, ok: true, series: entry.series, number: entry.number });
      } catch (e) {
        results.push({ key: item.key, ok: false, error: errorMessage(e) });
      }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

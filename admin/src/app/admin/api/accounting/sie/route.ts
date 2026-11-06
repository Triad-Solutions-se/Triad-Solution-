import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { companyName, loadAccounts, loadFiscalYears, loadLedger, selectFiscalYear } from "@/lib/accounting/data";
import { buildSie, encodeCp437 } from "@/lib/accounting/sie";
import { todayISO } from "@/lib/invoice";
import { errorMessage, requireMember } from "../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /admin/api/accounting/sie?ar=<räkenskapsår> — SIE 4-fil till konsult eller
// bokslutsprogram.
export async function GET(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  try {
    const supabase = await createClient();
    const [years, accounts, ledger, company] = await Promise.all([
      loadFiscalYears(supabase),
      loadAccounts(supabase),
      loadLedger(supabase),
      companyName(supabase),
    ]);
    const today = todayISO();
    const fy = selectFiscalYear(years, req.nextUrl.searchParams.get("ar") ?? undefined, today);
    if (!fy) return NextResponse.json({ error: "Inget räkenskapsår finns." }, { status: 404 });
    const previous =
      [...years].sort((a, b) => b.end_date.localeCompare(a.end_date)).find((y) => y.end_date < fy.start_date) ?? null;
    const text = buildSie({
      companyName: company.name,
      orgNumber: company.orgNumber,
      fiscalYear: fy,
      previousFiscalYear: previous,
      accounts,
      entries: ledger.entries,
      lines: ledger.lines,
      generatedAt: today,
      generatedBy: null,
    });
    const filename = `${company.name.replace(/[^A-Za-z0-9]+/g, "_")}_${fy.start_date.slice(0, 4)}.se`;
    return new NextResponse(Buffer.from(encodeCp437(text)), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

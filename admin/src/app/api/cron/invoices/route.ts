import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRecurringBilling } from "@/lib/recurring-send";
import { todayISO } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/invoices — körs dagligen av Vercel Cron (admin/vercel.json).
// Skapar återkommande fakturor för perioder vars fakturadag har passerat och
// mejlar dem för planer med "Skicka automatiskt". Vercel skickar
// "Authorization: Bearer <CRON_SECRET>" när CRON_SECRET är satt. Ligger
// utanför /admin så att middleware inte kräver inloggning; använder service
// role-nyckeln och går därför bara att anropa med hemligheten.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayISO();
  const run = await runRecurringBilling(createAdminClient());
  return NextResponse.json(
    {
      today,
      invoicesCreated: run.invoicesCreated,
      emailed: run.results.filter((r) => r.ok).length,
      failed: run.results.filter((r) => !r.ok).length,
      results: run.results,
      ...(run.error ? { error: run.error } : {}),
    },
    { status: run.error ? 500 : 200 },
  );
}

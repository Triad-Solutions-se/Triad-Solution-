import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ISO_DATE } from "@/lib/accounting/approve";
import { isVatCode } from "@/lib/accounting/core";
import { normalizeText } from "@/lib/accounting/rules";
import { errorMessage, requireMember } from "../../bank/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v);
const isAccount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1000 && (v as number) <= 8999;

function must<T>(result: { data?: T; error: { message: string } | null }): T | undefined {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// POST /admin/api/accounting/settings — { action, ... }. Inställningarna för
// bokföringen samlade: perioder, räkenskapsår, bankkonton, kontoplan och regler.
export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const log = (action: string, detail: unknown) => admin.from("accounting_log").insert({ action, detail, actor: user.id });
  try {
    switch (body?.action) {
      case "settings": {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (isDate(body.start_date)) patch.start_date = body.start_date;
        if (["monthly", "quarterly", "yearly"].includes(body.vat_period)) patch.vat_period = body.vat_period;
        const month = Number(body.fiscal_year_start_month);
        if (Number.isInteger(month) && month >= 1 && month <= 12) patch.fiscal_year_start_month = month;
        if (body.locked_through === null || isDate(body.locked_through)) patch.locked_through = body.locked_through;
        must(await admin.from("accounting_settings").update(patch).eq("id", 1));
        await log("settings", patch);
        break;
      }
      case "fiscal_year": {
        if (!isDate(body.start_date) || !isDate(body.end_date) || body.end_date <= body.start_date) {
          throw new Error("Ange start och slut för räkenskapsåret.");
        }
        if (typeof body.id === "string" && UUID.test(body.id)) {
          const { count, error } = await admin
            .from("journal_entries")
            .select("id", { count: "exact", head: true })
            .eq("fiscal_year_id", body.id)
            .or(`date.lt.${body.start_date},date.gt.${body.end_date}`);
          if (error) throw new Error(error.message);
          if (count) throw new Error(`${count} verifikationer ligger utanför de nya datumen.`);
          must(
            await admin
              .from("accounting_fiscal_years")
              .update({ start_date: body.start_date, end_date: body.end_date })
              .eq("id", body.id),
          );
        } else {
          must(await admin.from("accounting_fiscal_years").insert({ start_date: body.start_date, end_date: body.end_date }));
        }
        await log("fiscal_year", { id: body.id ?? null, start_date: body.start_date, end_date: body.end_date });
        break;
      }
      case "bank_account": {
        if (!UUID.test(String(body.id)) || !isAccount(body.ledger_account)) throw new Error("Ogiltigt konto.");
        must(await admin.from("bank_accounts").update({ ledger_account: body.ledger_account }).eq("id", body.id));
        await log("bank_account", { id: body.id, ledger_account: body.ledger_account });
        break;
      }
      case "account_add": {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!isAccount(body.number) || !name) throw new Error("Ange kontonummer (1000–8999) och namn.");
        must(
          await admin
            .from("accounting_accounts")
            .insert({ number: body.number, name, common: true, custom: true }),
        );
        await log("account_add", { number: body.number, name });
        break;
      }
      case "account_update": {
        if (!isAccount(body.number)) throw new Error("Ogiltigt konto.");
        const patch: Record<string, boolean> = {};
        if (typeof body.active === "boolean") patch.active = body.active;
        if (typeof body.common === "boolean") patch.common = body.common;
        must(await admin.from("accounting_accounts").update(patch).eq("number", body.number));
        await log("account_update", { number: body.number, ...patch });
        break;
      }
      case "rule_add": {
        const pattern = normalizeText(body.pattern);
        if (!pattern || !isAccount(body.account) || !isVatCode(body.vat_code)) {
          throw new Error("Ange text, konto och moms för regeln.");
        }
        const direction = ["in", "out", "any"].includes(body.direction) ? body.direction : "out";
        must(
          await admin.from("accounting_rules").upsert(
            {
              pattern,
              direction,
              account: body.account,
              vat_code: body.vat_code,
              origin: "learned",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "pattern" },
          ),
        );
        await log("rule_add", { pattern, direction, account: body.account, vat_code: body.vat_code });
        break;
      }
      case "rule_delete": {
        if (!UUID.test(String(body.id))) throw new Error("Ogiltig regel.");
        must(await admin.from("accounting_rules").delete().eq("id", body.id));
        await log("rule_delete", { id: body.id });
        break;
      }
      default:
        return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

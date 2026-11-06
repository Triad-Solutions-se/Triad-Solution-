import { createClient } from "@/lib/supabase/server";
import { loadAccounts, loadFiscalYears, loadSettings } from "@/lib/accounting/data";
import type { AccountingRule } from "@/lib/accounting/rules";
import { NotReady } from "../NotReady";
import { AccountingSettingsPanel } from "./AccountingSettingsPanel";

export const dynamic = "force-dynamic";

export default async function AccountingSettingsPage() {
  const supabase = await createClient();
  const settings = await loadSettings(supabase);
  if (!settings) return <NotReady />;
  const [accounts, years, { data: rules }, { data: banks }, { data: log }, { data: profiles }, { data: entryDates }] =
    await Promise.all([
      loadAccounts(supabase),
      loadFiscalYears(supabase),
      supabase.from("accounting_rules").select("id,pattern,direction,account,vat_code,origin").order("pattern"),
      supabase.from("bank_accounts").select("id,name,ledger_account,archived").order("name"),
      supabase.from("accounting_log").select("id,action,source_key,detail,actor,at").order("at", { ascending: false }).limit(50),
      supabase.from("profiles").select("id,display_name,email"),
      supabase.from("journal_entries").select("fiscal_year_id"),
    ]);
  const names = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name ?? p.email]));
  const usedYears = new Set((entryDates ?? []).map((e: any) => e.fiscal_year_id));

  return (
    <AccountingSettingsPanel
      settings={settings}
      accounts={accounts}
      years={years.map((y) => ({ ...y, used: usedYears.has(y.id) }))}
      rules={(rules ?? []) as AccountingRule[]}
      banks={(banks ?? []) as { id: string; name: string; ledger_account: number | null; archived: boolean }[]}
      log={(log ?? []).map((l: any) => ({ ...l, actor_name: l.actor ? (names.get(l.actor) ?? null) : null }))}
    />
  );
}

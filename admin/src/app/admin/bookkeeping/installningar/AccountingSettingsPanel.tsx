"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/Chip";
import { DateInput } from "@/components/DateInput";
import { type Account, VAT_OPTIONS, type VatCode } from "@/lib/accounting/core";
import { fiscalYearLabel, type FiscalYear } from "@/lib/accounting/periods";
import type { AccountingRule } from "@/lib/accounting/rules";
import type { AccountingSettings } from "@/lib/accounting/data";
import { fmtDateTime } from "@/lib/date";
import { Section } from "../../finance/FinanceBlocks";
import { NEW_BUTTON_CLS } from "../../finance/button-styles";
import { AccountSelect, postJson } from "../parts";

const field = "rounded-btn border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const VAT_LABEL = Object.fromEntries(VAT_OPTIONS.map((v) => [v.code, v.label])) as Record<VatCode, string>;
const DIRECTION = { in: "Inbetalning", out: "Utbetalning", any: "Båda" };
const ACTION_LABEL: Record<string, string> = {
  post: "Bokförde",
  reverse: "Rättade",
  ignore: "Hoppade över",
  unignore: "Lade tillbaka",
  settings: "Ändrade inställningar",
  fiscal_year: "Ändrade räkenskapsår",
  bank_account: "Ändrade bankkonto",
  account_add: "Lade till konto",
  account_update: "Ändrade konto",
  rule_add: "Lade till regel",
  rule_delete: "Tog bort regel",
  "vat-close-empty": "Momsavslut utan moms",
};

type LogRow = {
  id: number;
  action: string;
  source_key: string | null;
  detail: any;
  actor_name: string | null;
  at: string;
};

export function AccountingSettingsPanel({
  settings,
  accounts,
  years,
  rules,
  banks,
  log,
}: {
  settings: AccountingSettings;
  accounts: Account[];
  years: (FiscalYear & { used: boolean })[];
  rules: AccountingRule[];
  banks: { id: string; name: string; ledger_account: number | null; archived: boolean }[];
  log: LogRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [startDate, setStartDate] = useState(settings.start_date);
  const [vatPeriod, setVatPeriod] = useState(settings.vat_period);
  const [fyMonth, setFyMonth] = useState(settings.fiscal_year_start_month);
  const [locked, setLocked] = useState(settings.locked_through ?? "");

  const [newYear, setNewYear] = useState({ start_date: "", end_date: "" });
  const [yearEdits, setYearEdits] = useState<Record<string, { start_date: string; end_date: string }>>({});
  const [newAccount, setNewAccount] = useState({ number: "", name: "" });
  const [newRule, setNewRule] = useState<{ pattern: string; direction: string; account: number; vat_code: VatCode }>({
    pattern: "",
    direction: "out",
    account: 6540,
    vat_code: "se25",
  });

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await postJson("/admin/api/accounting/settings", body);
      setSaved(true);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const accountName = (n: number) => accounts.find((a) => a.number === n)?.name ?? "";
  const lockChanged = (locked || null) !== settings.locked_through;

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (
      lockChanged &&
      (!locked || (settings.locked_through && locked < settings.locked_through)) &&
      !confirm("Vill ni låsa upp en redan låst period? Gör det bara för att rätta en redovisning, och lämna då rättad momsdeklaration.")
    ) {
      return;
    }
    await send({
      action: "settings",
      start_date: startDate,
      vat_period: vatPeriod,
      fiscal_year_start_month: fyMonth,
      locked_through: locked || null,
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-btn border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mb-4 rounded-btn border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Sparat.
        </p>
      )}

      <Section title="Bokföring" hint="Fakturametoden: fakturor bokförs när de uppstår och betalningen bokförs mot fordran eller skulden.">
        <form onSubmit={saveSettings} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="text-xs text-[var(--muted)]">
            <div className="mb-1">Bokföringen startar</div>
            <DateInput value={startDate} onChange={setStartDate} ariaLabel="Bokföringen startar" className={`${field} w-full`} />
            <p className="mt-1">Underlag före datumet föreslås inte i kön.</p>
          </div>
          <label className="text-xs text-[var(--muted)]">
            <div className="mb-1">Momsredovisning</div>
            <select value={vatPeriod} onChange={(e) => setVatPeriod(e.target.value as typeof vatPeriod)} className={`${field} w-full`}>
              <option value="quarterly">Kvartalsvis</option>
              <option value="monthly">Månadsvis</option>
              <option value="yearly">Helår</option>
            </select>
            <p className="mt-1">Samma som hos Skatteverket.</p>
          </label>
          <label className="text-xs text-[var(--muted)]">
            <div className="mb-1">Räkenskapsåret börjar</div>
            <select value={fyMonth} onChange={(e) => setFyMonth(Number(e.target.value))} className={`${field} w-full`}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <p className="mt-1">Gäller nya år som skapas automatiskt.</p>
          </label>
          <div className="text-xs text-[var(--muted)]">
            <div className="mb-1">Låst till och med</div>
            <DateInput value={locked} onChange={setLocked} ariaLabel="Låst till och med" className={`${field} w-full`} />
            <p className="mt-1">Sätts av momsavslutet. Inget kan bokföras på låsta dagar.</p>
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <button type="submit" disabled={busy} className={`${NEW_BUTTON_CLS.primary} disabled:opacity-50`}>
              Spara
            </button>
          </div>
        </form>
      </Section>

      <Section title="Räkenskapsår" hint="Första året får vara förlängt (upp till 18 månader). Ändra datumen om ert första år ser annorlunda ut.">
        <div className="divide-y divide-white/5">
          {years.map((y) => {
            const edit = yearEdits[y.id] ?? { start_date: y.start_date, end_date: y.end_date };
            const changed = edit.start_date !== y.start_date || edit.end_date !== y.end_date;
            return (
              <div key={y.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="w-16 font-medium">{fiscalYearLabel(y).slice(0, 4)}</span>
                <DateInput
                  value={edit.start_date}
                  onChange={(v) => setYearEdits((p) => ({ ...p, [y.id]: { ...edit, start_date: v } }))}
                  ariaLabel="Start"
                  className={field}
                />
                <span className="text-[var(--muted)]">till</span>
                <DateInput
                  value={edit.end_date}
                  onChange={(v) => setYearEdits((p) => ({ ...p, [y.id]: { ...edit, end_date: v } }))}
                  ariaLabel="Slut"
                  className={field}
                />
                {y.used && <Chip tone="gray">Har verifikationer</Chip>}
                {changed && (
                  <button type="button" disabled={busy} onClick={() => send({ action: "fiscal_year", id: y.id, ...edit })} className={NEW_BUTTON_CLS.small}>
                    Spara
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="w-16 text-[var(--muted)]">Nytt</span>
            <DateInput value={newYear.start_date} onChange={(v) => setNewYear((p) => ({ ...p, start_date: v }))} ariaLabel="Start på nytt år" className={field} />
            <span className="text-[var(--muted)]">till</span>
            <DateInput value={newYear.end_date} onChange={(v) => setNewYear((p) => ({ ...p, end_date: v }))} ariaLabel="Slut på nytt år" className={field} />
            <button
              type="button"
              disabled={busy || !newYear.start_date || !newYear.end_date}
              onClick={async () => {
                if (await send({ action: "fiscal_year", ...newYear })) setNewYear({ start_date: "", end_date: "" });
              }}
              className={`${NEW_BUTTON_CLS.small} disabled:opacity-50`}
            >
              <Plus size={13} /> Lägg till
            </button>
          </div>
        </div>
      </Section>

      {banks.length > 0 && (
        <Section title="Bankkonton" hint="Vilket bokföringskonto varje bankkonto bokförs på.">
          <div className="divide-y divide-white/5">
            {banks.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  {b.name}
                  {b.archived && <span className="ml-2 text-xs text-[var(--muted)]">Arkiverat</span>}
                </span>
                <div className="w-full sm:w-80">
                  <AccountSelect
                    value={b.ledger_account ?? 1930}
                    onChange={(n) => send({ action: "bank_account", id: b.id, ledger_account: n })}
                    accounts={accounts.filter((a) => a.number >= 1900 && a.number <= 1999)}
                    disabled={busy}
                    label={`Bokföringskonto för ${b.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Konteringsregler"
        hint="Så väljs konto och moms. Väljer ni ett annat konto i kön sparas valet här, och det gäller nästa gång motparten dyker upp."
      >
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="p-3">Text innehåller</th>
              <th className="p-3">Gäller</th>
              <th className="p-3">Konto</th>
              <th className="p-3">Moms</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    {r.pattern}
                    {r.origin === "learned" && <Chip tone="teal">Inlärd</Chip>}
                  </span>
                </td>
                <td className="p-3 text-[var(--muted)]">{DIRECTION[r.direction]}</td>
                <td className="p-3">
                  <span className="font-mono">{r.account}</span> <span className="text-[var(--muted)]">{accountName(r.account)}</span>
                </td>
                <td className="p-3 text-[var(--muted)]">{VAT_LABEL[r.vat_code]}</td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send({ action: "rule_delete", id: r.id })}
                    aria-label={`Ta bort regeln ${r.pattern}`}
                    className="text-[var(--muted)] hover:text-rose-300 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ action: "rule_add", ...newRule })) setNewRule((p) => ({ ...p, pattern: "" }));
          }}
          className="flex flex-wrap items-center gap-2 border-t border-white/5 px-5 py-3"
        >
          <input
            required
            value={newRule.pattern}
            onChange={(e) => setNewRule((p) => ({ ...p, pattern: e.target.value }))}
            placeholder="Text, t.ex. hetzner"
            aria-label="Text i regeln"
            className={`${field} w-44`}
          />
          <select value={newRule.direction} onChange={(e) => setNewRule((p) => ({ ...p, direction: e.target.value }))} aria-label="Gäller" className={field}>
            <option value="out">Utbetalning</option>
            <option value="in">Inbetalning</option>
            <option value="any">Båda</option>
          </select>
          <div className="w-64">
            <AccountSelect value={newRule.account} onChange={(n) => setNewRule((p) => ({ ...p, account: n }))} accounts={accounts} label="Konto i regeln" />
          </div>
          <select
            value={newRule.vat_code}
            onChange={(e) => setNewRule((p) => ({ ...p, vat_code: e.target.value as VatCode }))}
            aria-label="Moms i regeln"
            className={field}
          >
            {VAT_OPTIONS.map((v) => (
              <option key={v.code} value={v.code}>
                {v.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className={`${NEW_BUTTON_CLS.small} disabled:opacity-50`}>
            <Plus size={13} /> Lägg till regel
          </button>
        </form>
      </Section>

      <Section title="Kontoplan" hint="Urval ur BAS 2026, utan konton som inte får användas i K2. Lägg till fler vid behov.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ action: "account_add", number: Number(newAccount.number), name: newAccount.name })) {
              setNewAccount({ number: "", name: "" });
            }
          }}
          className="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-3"
        >
          <input
            required
            inputMode="numeric"
            pattern="[1-8][0-9]{3}"
            value={newAccount.number}
            onChange={(e) => setNewAccount((p) => ({ ...p, number: e.target.value }))}
            placeholder="Konto"
            aria-label="Kontonummer"
            className={`${field} w-24 font-mono`}
          />
          <input
            required
            value={newAccount.name}
            onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
            placeholder="Namn"
            aria-label="Kontonamn"
            className={`${field} min-w-0 flex-1 sm:max-w-sm`}
          />
          <button type="submit" disabled={busy} className={`${NEW_BUTTON_CLS.small} disabled:opacity-50`}>
            <Plus size={13} /> Lägg till konto
          </button>
        </form>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 bg-[var(--surface)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="p-3">Konto</th>
                <th className="p-3">Namn</th>
                <th className="p-3">Ruta</th>
                <th className="p-3">Vanligt</th>
                <th className="p-3">Aktivt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {accounts.map((a) => (
                <tr key={a.number} className={a.active ? "" : "opacity-50"}>
                  <td className="p-3 font-mono">{a.number}</td>
                  <td className="p-3">{a.name}</td>
                  <td className="p-3 font-mono text-[var(--muted)]">{a.vat_box ?? ""}</td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={a.common}
                      disabled={busy}
                      onChange={(e) => send({ action: "account_update", number: a.number, common: e.target.checked })}
                      aria-label={`${a.number} vanligt konto`}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={a.active}
                      disabled={busy}
                      onChange={(e) => send({ action: "account_update", number: a.number, active: e.target.checked })}
                      aria-label={`${a.number} aktivt`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Behandlingshistorik" hint="De senaste 50 händelserna.">
        <ul className="divide-y divide-white/5 text-sm">
          {log.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2">
              <span>
                {ACTION_LABEL[l.action] ?? l.action}
                {l.detail?.number != null && <span className="font-mono"> A{l.detail.number}</span>}
                {l.actor_name && <span className="text-[var(--muted)]"> · {l.actor_name}</span>}
              </span>
              <span className="text-xs text-[var(--muted)]">{fmtDateTime(l.at)}</span>
            </li>
          ))}
          {!log.length && <li className="p-8 text-center text-sm text-[var(--muted)]">Inget har hänt än.</li>}
        </ul>
      </Section>
    </>
  );
}

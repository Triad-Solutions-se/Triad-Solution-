"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ACCOUNT_CLASSES, type Account, type EntryLine, imbalance, money } from "@/lib/accounting/core";
import { fiscalYearLabel, type FiscalYear } from "@/lib/accounting/periods";

/** POST med JSON. Kastar med serverns felmeddelande. */
export async function postJson<T = any>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "Något gick fel");
  return data as T;
}

/** Kontolista med vanliga konton först. Skriv kontonumret för att hoppa till kontot. */
export function AccountSelect({
  value,
  onChange,
  accounts,
  disabled,
  label = "Konto",
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  accounts: Account[];
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const active = accounts.filter((a) => a.active);
  const common = active.filter((a) => a.common);
  const known = accounts.find((a) => a.number === value);
  const option = (a: Account, prefix = "") => (
    <option key={`${prefix}${a.number}`} value={a.number}>
      {a.number} {a.name}
    </option>
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      aria-label={label}
      className={`w-full min-w-0 truncate rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-sm font-mono disabled:opacity-60 ${className}`}
    >
      {/* Ett konto som tagits ur bruk ska fortfarande synas på en äldre post. */}
      {(!known || !known.active) && (
        <option value={value}>
          {value} {known?.name ?? "Okänt konto"}
        </option>
      )}
      {common.length > 0 && <optgroup label="Vanliga">{common.map((a) => option(a, "c"))}</optgroup>}
      {ACCOUNT_CLASSES.map((c) => {
        const inClass = active.filter((a) => Math.floor(a.number / 1000) === c.digit);
        if (!inClass.length) return null;
        return (
          <optgroup key={c.digit} label={c.label}>
            {inClass.map((a) => option(a))}
          </optgroup>
        );
      })}
    </select>
  );
}

const amountInput =
  "w-full rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-right font-mono text-sm tabular-nums";

/** Konteringsrader: konto med lista, debet och kredit. */
export function LineTable({
  lines,
  onChange,
  accounts,
  editing = false,
  disabled = false,
}: {
  lines: EntryLine[];
  onChange: (lines: EntryLine[]) => void;
  accounts: Account[];
  editing?: boolean;
  disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<EntryLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setAmount = (i: number, side: "debit" | "credit", raw: string) => {
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    set(i, side === "debit" ? { debit: n, ...(n ? { credit: 0 } : {}) } : { credit: n, ...(n ? { debit: 0 } : {}) });
  };
  const diff = imbalance(lines);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  // På telefon får kontot en egen rad, så att hela kontonamnet syns.
  const columns = editing
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] sm:grid-cols-[minmax(0,1fr)_7rem_7rem_1.5rem]"
    : "grid-cols-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]";
  const accountCell = editing ? "col-span-3 sm:col-span-1" : "col-span-2 sm:col-span-1";
  const sideLabel = (text: string) => <span className="mr-1.5 text-[11px] text-[var(--muted)] sm:hidden">{text}</span>;

  return (
    <div className="space-y-1">
      <div className={`hidden sm:grid ${columns} gap-2 px-0.5 text-[11px] uppercase tracking-wider text-[var(--muted)]`}>
        <span>Konto</span>
        <span className="text-right">Debet</span>
        <span className="text-right">Kredit</span>
        {editing && <span />}
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`grid ${columns} items-center gap-x-2 gap-y-1`}>
          <div className={`flex min-w-0 items-center gap-2 ${accountCell}`}>
            <AccountSelect
              value={l.account}
              onChange={(n) => set(i, { account: n })}
              accounts={accounts}
              disabled={disabled}
              label={`Konto rad ${i + 1}`}
            />
            {l.vat_box && (
              <span
                className="hidden shrink-0 rounded-full border border-sky-500/25 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300 sm:inline"
                title="Beloppet redovisas i den här rutan i momsdeklarationen"
              >
                Ruta {l.vat_box}
              </span>
            )}
          </div>
          {editing ? (
            <>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={l.debit || ""}
                onChange={(e) => setAmount(i, "debit", e.target.value)}
                disabled={disabled}
                placeholder="Debet"
                aria-label={`Debet rad ${i + 1}`}
                className={amountInput}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={l.credit || ""}
                onChange={(e) => setAmount(i, "credit", e.target.value)}
                disabled={disabled}
                placeholder="Kredit"
                aria-label={`Kredit rad ${i + 1}`}
                className={amountInput}
              />
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                disabled={disabled || lines.length <= 2}
                aria-label={`Ta bort rad ${i + 1}`}
                className="text-[var(--muted)] hover:text-white disabled:opacity-30"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <span className="text-right font-mono text-sm tabular-nums">
                {l.debit ? (
                  <>
                    {sideLabel("Debet")}
                    {money(l.debit)}
                  </>
                ) : (
                  ""
                )}
              </span>
              <span className="text-right font-mono text-sm tabular-nums">
                {l.credit ? (
                  <>
                    {sideLabel("Kredit")}
                    {money(l.credit)}
                  </>
                ) : (
                  ""
                )}
              </span>
            </>
          )}
        </div>
      ))}
      {editing && (
        <div className={`grid ${columns} items-center gap-x-2 gap-y-1 pt-1`}>
          <button
            type="button"
            className={`${accountCell} flex items-center gap-1 justify-self-start text-xs text-teal-300 hover:text-teal-200 disabled:opacity-50`}
            onClick={() => onChange([...lines, { account: lines[lines.length - 1]?.account ?? 6991, debit: 0, credit: 0 }])}
            disabled={disabled}
          >
            <Plus size={12} /> Lägg till rad
          </button>
          <span className="text-right font-mono text-xs tabular-nums text-[var(--muted)]">{money(totalDebit)}</span>
          <span className="text-right font-mono text-xs tabular-nums text-[var(--muted)]">{money(totalCredit)}</span>
          <span />
        </div>
      )}
      {diff !== 0 && (
        <p className="text-xs text-rose-300" role="alert">
          Raderna balanserar inte: {money(Math.abs(diff))} kr skiljer mellan debet och kredit.
        </p>
      )}
    </div>
  );
}

/** Väljer räkenskapsår via ?ar= i adressen. */
export function FiscalYearSelect({ years, value }: { years: FiscalYear[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
      Räkenskapsår
      <select
        value={value ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("ar", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {fiscalYearLabel(y)}
          </option>
        ))}
      </select>
    </label>
  );
}

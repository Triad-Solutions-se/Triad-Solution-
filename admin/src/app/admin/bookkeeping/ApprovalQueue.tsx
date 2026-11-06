"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Pencil, RotateCcw, SkipForward } from "lucide-react";
import { Chip } from "@/components/Chip";
import { DateInput } from "@/components/DateInput";
import {
  type Account,
  type EntryLine,
  type VatCode,
  VAT_OPTIONS,
  imbalance,
  moneySek,
  rebuildLines,
} from "@/lib/accounting/core";
import { type Confidence, GROUP_LABEL, type Proposal, type ProposalGroup } from "@/lib/accounting/proposals";
import { fmtDate } from "@/lib/date";
import { BankReceipt } from "../finance/BankReceipt";
import { LineTable, postJson } from "./parts";

const CONFIDENCE: Record<Confidence, { label: string; tone: "green" | "teal" | "blue" | "yellow"; title: string }> = {
  certain: { label: "Säker", tone: "green", title: "Följer direkt av underlaget" },
  learned: { label: "Inlärd", tone: "teal", title: "Samma konto som ni valde senast för den här motparten" },
  rule: { label: "Regel", tone: "blue", title: "Föreslaget utifrån motparten. Kontrollera gärna mot kvittot" },
  guess: { label: "Kontrollera", tone: "yellow", title: "Portalen är inte säker. Välj konto och moms" },
};

/** Ändringar i ett förslag. Oändrade förslag läses direkt från servern. */
type Draft = { date: string; description: string; lines: EntryLine[]; vat: VatCode | null; editing: boolean };

const fromProposal = (p: Proposal): Draft => ({
  date: p.date,
  description: p.description,
  lines: p.lines,
  vat: p.vat,
  editing: false,
});

const BATCH = 100;

export function ApprovalQueue({
  proposals,
  ignored,
  accounts,
}: {
  proposals: Proposal[];
  ignored: Proposal[];
  accounts: Account[];
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<ProposalGroup | "all">("all");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const draftOf = (p: Proposal) => edits[p.key] ?? fromProposal(p);
  const counts = useMemo(() => {
    const c = new Map<ProposalGroup, number>();
    for (const p of proposals) c.set(p.group, (c.get(p.group) ?? 0) + 1);
    return c;
  }, [proposals]);
  const visible = group === "all" ? proposals : proposals.filter((p) => p.group === group);
  const selectable = visible.filter((p) => imbalance(draftOf(p).lines) === 0);
  const selectedVisible = selectable.filter((p) => selected.has(p.key));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;

  const update = (p: Proposal, patch: Partial<Draft>) =>
    setEdits((prev) => ({ ...prev, [p.key]: { ...draftOf(p), ...patch } }));

  function changeVat(p: Proposal, vat: VatCode) {
    const d = draftOf(p);
    const account = d.lines.find((l) => l.role === "primary")?.account;
    const contra = d.lines.find((l) => l.role === "contra")?.account;
    if (!account || !contra) return update(p, { vat });
    // Köp: positivt brutto. Försäljning: inbetalningens belopp.
    const gross = p.mode === "purchase" ? -p.amount : p.amount;
    const lines = rebuildLines(p.mode, { gross, account, contra, vat });
    update(p, { vat, ...(lines ? { lines } : {}) });
  }

  async function approve(keys: string[]) {
    if (!keys.length) return;
    setBusy(new Set(keys));
    setNotice(null);
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));
    const byKey = new Map(proposals.map((p) => [p.key, p]));
    const booked: string[] = [];
    const doneKeys: string[] = [];
    const failed: Record<string, string> = {};
    try {
      for (let i = 0; i < keys.length; i += BATCH) {
        const items = keys.slice(i, i + BATCH).map((key) => {
          const d = draftOf(byKey.get(key)!);
          return { key, date: d.date, description: d.description, lines: d.lines, vat: d.vat };
        });
        const data = await postJson<{ results: { key: string; ok: boolean; series?: string; number?: number; error?: string }[] }>(
          "/admin/api/accounting/approve",
          { items },
        );
        for (const r of data.results) {
          if (r.ok) {
            booked.push(`${r.series}${r.number}`);
            doneKeys.push(r.key);
          } else {
            failed[r.key] = r.error ?? "Kunde inte bokföras";
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const k of keys) if (!doneKeys.includes(k)) failed[k] = message;
    }
    setBusy(new Set());
    setErrors((prev) => ({ ...prev, ...failed }));
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !doneKeys.includes(k))));
    setSelected((prev) => new Set([...prev].filter((k) => !doneKeys.includes(k))));
    if (booked.length) {
      setNotice(booked.length === 1 ? `Bokförd som ${booked[0]}.` : `${booked.length} poster bokförda (${booked[0]}–${booked[booked.length - 1]}).`);
    }
    router.refresh();
  }

  async function ignore(p: Proposal) {
    if (!confirm(`Hoppa över "${p.title}"? Posten bokförs inte, men kan läggas tillbaka nedanför kön.`)) return;
    try {
      await postJson("/admin/api/accounting/ignore", { key: p.key });
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [p.key]: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function restore(p: Proposal) {
    try {
      await postJson("/admin/api/accounting/ignore", { key: p.key }, "DELETE");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filterButton = (value: ProposalGroup | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setGroup(value)}
      aria-pressed={group === value}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${
        group === value
          ? "border-teal-400/40 bg-teal-400/15 text-teal-200"
          : "border-white/10 text-[var(--muted)] hover:bg-white/5 hover:text-white"
      }`}
    >
      {label} <span className="font-mono">{count}</span>
    </button>
  );

  return (
    // Luft under sista kortet: timerknappen täcker annars Godkänn på telefon.
    <section aria-label="Att godkänna" className="pb-24 lg:pb-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filterButton("all", "Alla", proposals.length)}
          {(Object.keys(GROUP_LABEL) as ProposalGroup[])
            .filter((g) => counts.has(g))
            .map((g) => filterButton(g, GROUP_LABEL[g], counts.get(g)!))}
        </div>
        {visible.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.key)))
                }
              />
              Markera alla
            </label>
            <button
              type="button"
              onClick={() => approve(selectedVisible.map((p) => p.key))}
              disabled={!selectedVisible.length || busy.size > 0}
              className="flex items-center gap-1.5 rounded-btn bg-teal-500 px-3 py-1.5 text-sm font-semibold text-fixed-white transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              {busy.size > 1 ? "Bokför…" : `Godkänn markerade${selectedVisible.length ? ` (${selectedVisible.length})` : ""}`}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="mb-3 rounded-btn border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {!visible.length && (
        <div className="glass rounded-xl border border-white/10 p-10 text-center">
          <CheckCircle2 size={22} className="mx-auto mb-2 text-emerald-300" />
          <p className="font-medium">Inget att godkänna</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Nya fakturor, banktransaktioner och utlägg dyker upp här.</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((p) => {
          const d = draftOf(p);
          const conf = CONFIDENCE[p.confidence];
          const balanced = imbalance(d.lines) === 0;
          const isBusy = busy.has(p.key);
          const vatChoices = p.mode === "sale" ? VAT_OPTIONS.filter((v) => !v.code.endsWith("_rc")) : VAT_OPTIONS;
          return (
            <article key={p.key} className="glass rounded-xl border border-white/10 p-4">
              <header className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.key)}
                  onChange={() => toggle(p.key)}
                  disabled={!balanced || isBusy}
                  aria-label={`Markera ${p.title}`}
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{p.title}</h3>
                    <span title={conf.title}>
                      <Chip tone={conf.tone}>{conf.label}</Chip>
                    </span>
                    <Chip tone="gray">{GROUP_LABEL[p.group]}</Chip>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {fmtDate(p.sourceDate)} · {p.reason}
                    {p.href && (
                      <>
                        {" · "}
                        <Link href={p.href} className="inline-flex items-center hover:text-teal-300">
                          Underlag <ChevronRight size={11} />
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div
                  className={`shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums ${
                    p.amount > 0 ? "text-emerald-300" : ""
                  }`}
                >
                  {moneySek(p.amount)}
                </div>
              </header>

              <div className="mt-3">
                <LineTable
                  lines={d.lines}
                  onChange={(lines) => update(p, { lines })}
                  accounts={accounts}
                  editing={d.editing}
                  disabled={isBusy}
                />
              </div>

              {d.editing && (
                <label className="mt-3 block text-xs text-[var(--muted)]">
                  Text på verifikationen
                  <input
                    value={d.description}
                    onChange={(e) => update(p, { description: e.target.value })}
                    className="mt-1 w-full rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              )}

              {p.warnings.map((w) => (
                <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
              {errors[p.key] && (
                <p role="alert" className="mt-2 text-xs text-rose-300">
                  {errors[p.key]}
                </p>
              )}

              <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {p.mode !== "fixed" && d.vat && (
                  <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    Moms
                    <select
                      value={d.vat}
                      onChange={(e) => changeVat(p, e.target.value as VatCode)}
                      disabled={isBusy}
                      className="max-w-[15rem] rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                    >
                      {vatChoices.map((v) => (
                        <option key={v.code} value={v.code}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span>Bokföringsdag</span>
                  <DateInput
                    value={d.date}
                    onChange={(date) => update(p, { date })}
                    ariaLabel={`Bokföringsdag för ${p.title}`}
                    className="rounded-btn border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
                  />
                </div>
                {p.transactionId ? (
                  <BankReceipt transactionId={p.transactionId} path={p.receiptPath} booked outgoing={p.amount < 0} />
                ) : p.receiptPath ? (
                  <a
                    href={`/admin/finance/files/download?path=${encodeURIComponent(p.receiptPath)}`}
                    className="text-xs text-teal-300 hover:text-teal-200"
                  >
                    Underlag
                  </a>
                ) : p.needsReceipt ? (
                  <Link href="/admin/finance" className="text-xs text-amber-300 hover:text-amber-200">
                    Kvitto saknas
                  </Link>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => update(p, { editing: !d.editing })}
                    disabled={isBusy}
                    aria-pressed={d.editing}
                    className="flex items-center gap-1 rounded-btn px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <Pencil size={12} /> {d.editing ? "Klar" : "Ändra rader"}
                  </button>
                  {edits[p.key] && (
                    <button
                      type="button"
                      onClick={() =>
                        setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== p.key)))
                      }
                      disabled={isBusy}
                      className="flex items-center gap-1 rounded-btn px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> Återställ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => ignore(p)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-btn px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <SkipForward size={12} /> Hoppa över
                  </button>
                  <button
                    type="button"
                    onClick={() => approve([p.key])}
                    disabled={!balanced || isBusy || !d.date}
                    className="flex items-center gap-1.5 rounded-btn bg-teal-500 px-3 py-1.5 text-sm font-semibold text-fixed-white transition-colors hover:bg-teal-400 disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> {isBusy ? "Bokför…" : "Godkänn"}
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>

      {ignored.length > 0 && (
        <details className="mt-6 glass rounded-xl border border-white/10">
          <summary className="cursor-pointer px-4 py-3 text-sm text-[var(--muted)]">
            Överhoppade poster ({ignored.length})
          </summary>
          <ul className="divide-y divide-white/5">
            {ignored.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {fmtDate(p.sourceDate)} · {p.title}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-mono tabular-nums text-[var(--muted)]">{moneySek(p.amount)}</span>
                  <button type="button" onClick={() => restore(p)} className="text-xs text-teal-300 hover:text-teal-200">
                    Lägg tillbaka
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

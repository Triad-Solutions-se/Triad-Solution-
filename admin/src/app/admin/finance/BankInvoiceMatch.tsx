"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Undo2, X } from "lucide-react";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";
import { MATCH_RULE_LABEL, type TxMatchInfo } from "@/lib/bank-match";

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "Något gick fel");
}

const post = (body: Record<string, string>) =>
  call("/admin/api/bank/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const smallBtn =
  "rounded-btn border border-white/10 hover:bg-white/5 px-2 py-1 text-[11px] font-medium flex items-center gap-1 disabled:opacity-50";

/** Kopplad faktura, förslag och manuell koppling för en inbetalning. */
export function BankInvoiceMatch({ transactionId, info }: { transactionId: string; info: TxMatchInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const apply = (invoiceId: string) =>
    run(`apply:${invoiceId}`, () => post({ action: "apply", transactionId, invoiceId }));
  const dismiss = (invoiceId: string) =>
    run(`dismiss:${invoiceId}`, () => post({ action: "dismiss", transactionId, invoiceId }));

  const applied = info.applied;
  if (applied) {
    const undo = () => {
      if (!confirm(`Ångra kopplingen? Faktura ${applied.number} blir obetald igen.`)) return;
      void run("undo", () => call(`/admin/api/bank/matches/${applied.matchId}`, { method: "DELETE" }));
    };
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-emerald-300 flex items-center gap-1">
          <CheckCircle2 size={12} /> Betalade faktura
        </span>
        <Link href={`/admin/invoices/${applied.invoiceId}`} className="font-mono hover:text-teal-300 underline-offset-2 hover:underline">
          {applied.number}
        </Link>
        {applied.customer && <span className="text-[var(--muted)] truncate max-w-[14rem]">{applied.customer}</span>}
        <span title={`Kopplad via ${MATCH_RULE_LABEL[applied.rule].toLowerCase()}`}>
          <Chip tone={applied.method === "auto" ? "teal" : "gray"}>
            {applied.method === "auto" ? "Automatiskt" : "Manuellt"}
          </Chip>
        </span>
        <button onClick={undo} disabled={!!busy} className={`${smallBtn} text-[var(--muted)]`}>
          <Undo2 size={11} /> {busy === "undo" ? "Ångrar…" : "Ångra"}
        </button>
        {error && <span className="text-rose-300 basis-full">{error}</span>}
      </div>
    );
  }

  if (!info.suggestions.length && !info.options.length) return null;

  return (
    <div className="mt-1.5 space-y-1.5 text-xs">
      {info.suggestions.map((s) => (
        <div key={s.invoiceId} className="flex flex-wrap items-center gap-2">
          <Chip tone={s.strength === "strong" ? "teal" : "yellow"}>
            {s.strength === "strong" ? "Träff" : "Möjlig"}
          </Chip>
          <span>
            Faktura{" "}
            <Link href={`/admin/invoices/${s.invoiceId}`} className="font-mono hover:text-teal-300 underline-offset-2 hover:underline">
              {s.number}
            </Link>
            {s.customer && <span className="text-[var(--muted)]"> · {s.customer}</span>}
            {s.dueDate && <span className="text-[var(--muted)]"> · förfaller {fmtDate(s.dueDate)}</span>}
          </span>
          <span className="text-[var(--muted)]">{s.reason}</span>
          <span className="inline-flex items-center gap-2">
            <button
              onClick={() => apply(s.invoiceId)}
              disabled={!!busy}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-2 py-1 text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={11} />
              {busy === `apply:${s.invoiceId}` ? "Markerar…" : "Markera som betald"}
            </button>
            <button
              onClick={() => dismiss(s.invoiceId)}
              disabled={!!busy}
              className="opacity-60 hover:opacity-100 disabled:opacity-30"
              title="Inte den här fakturan"
              aria-label={`Avfärda förslaget faktura ${s.number}`}
            >
              <X size={13} />
            </button>
          </span>
        </div>
      ))}
      {info.options.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            disabled={!!busy}
            className="rounded-btn bg-white/5 border border-white/10 px-2 py-1 text-[11px] max-w-[18rem]"
            aria-label="Koppla till obetald faktura med samma belopp"
          >
            <option value="">
              {info.suggestions.length ? "Annan faktura med samma belopp…" : "Koppla till faktura med samma belopp…"}
            </option>
            {info.options.map((o) => (
              <option key={o.invoiceId} value={o.invoiceId}>
                {o.number}
                {o.customer ? ` · ${o.customer}` : ""}
              </option>
            ))}
          </select>
          {picked && (
            <button onClick={() => apply(picked)} disabled={!!busy} className={smallBtn}>
              <Link2 size={11} /> {busy === `apply:${picked}` ? "Markerar…" : "Markera som betald"}
            </button>
          )}
        </div>
      )}
      {error && <div className="text-rose-300">{error}</div>}
    </div>
  );
}

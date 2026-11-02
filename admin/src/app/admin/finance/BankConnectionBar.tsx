"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Unlink, X } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/date";

export type BankConnectionInfo = {
  id: string;
  aspsp_name: string;
  status: string;
  valid_until: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

// Synka automatiskt när sidan öppnas om senaste synken är äldre än så här.
const AUTO_SYNC_AFTER_MS = 3 * 3600_000;
const RENEW_WARNING_DAYS = 14;

export async function startBankConnect(bankAccountId?: string) {
  const res = await fetch("/admin/api/bank/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bankAccountId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "Kunde inte starta bankkopplingen");
  window.location.href = data.url;
}

export function BankConnectionBar({
  connection,
  bankName,
}: {
  connection: BankConnectionInfo | null;
  bankName: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSynced = useRef(false);

  const flash = params.get("bank");
  const flashMessage = params.get("message");
  const flashAccounts = params.get("accounts");

  const active = connection?.status === "active";
  const name = connection?.aspsp_name ?? bankName;
  const daysLeft = connection?.valid_until
    ? Math.floor((new Date(connection.valid_until).getTime() - Date.now()) / 86_400_000)
    : null;

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      await startBankConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function sync(silent = false) {
    if (!silent) setBusy("sync");
    setError(null);
    try {
      const res = await fetch("/admin/api/bank/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "Synken misslyckades");
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setBusy(null);
      router.refresh();
    }
  }

  async function disconnect() {
    if (!connection) return;
    if (!confirm(`Koppla från ${name}? Saldot räknas då fram från portalens egna poster igen.`)) return;
    setBusy("disconnect");
    setError(null);
    const res = await fetch(`/admin/api/bank/connections/${connection.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(data.error || "Kunde inte koppla från");
    if (flash) router.replace("/admin/finance", { scroll: false });
    else router.refresh();
  }

  useEffect(() => {
    if (!active || autoSynced.current) return;
    const last = connection?.last_synced_at ? new Date(connection.last_synced_at).getTime() : 0;
    if (Date.now() - last < AUTO_SYNC_AFTER_MS) return;
    autoSynced.current = true;
    void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, connection?.last_synced_at]);

  const button =
    "rounded-btn border border-white/10 hover:bg-white/5 px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50";

  return (
    <div className="px-5 py-3 border-b border-white/5 space-y-2">
      {flash && (
        <div
          className={`flex items-start justify-between gap-3 rounded-btn border px-3 py-2 text-sm ${
            flash === "connected" && !flashMessage
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/25 bg-amber-500/10 text-amber-200"
          }`}
        >
          <span>
            {flash === "connected"
              ? `${name} är kopplad${flashAccounts ? ` (${flashAccounts} konto${flashAccounts === "1" ? "" : "n"})` : ""}.`
              : "Bankkopplingen misslyckades."}
            {flashMessage && ` ${flashMessage}`}
          </span>
          <button
            onClick={() => router.replace("/admin/finance", { scroll: false })}
            className="opacity-70 hover:opacity-100"
            aria-label="Stäng"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[var(--muted)]">
          {!connection && <>Koppla {name} för att se riktigt saldo och transaktioner från banken.</>}
          {active && (
            <>
              <span className="text-emerald-300">● {name} kopplad</span>
              {" · "}
              {connection.last_synced_at
                ? `synkad ${fmtDateTime(connection.last_synced_at)}`
                : "inte synkad än"}
              {connection.valid_until && <> · medgivande till {fmtDate(connection.valid_until)}</>}
              {daysLeft !== null && daysLeft <= RENEW_WARNING_DAYS && (
                <span className="text-amber-300"> · går ut om {Math.max(daysLeft, 0)} dagar</span>
              )}
            </>
          )}
          {connection && !active && (
            <span className="text-amber-300">
              {connection.status === "expired"
                ? `Medgivandet till ${name} har gått ut — koppla om med BankID.`
                : `Kopplingen till ${name} fungerar inte: ${connection.last_error ?? "okänt fel"}`}
            </span>
          )}
          {active && connection.last_error && (
            <div className="text-amber-300 mt-1">Senaste synken misslyckades: {connection.last_error}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <>
              <button onClick={() => sync()} disabled={!!busy} className={button}>
                <RefreshCw size={13} className={busy === "sync" ? "animate-spin" : ""} />
                {busy === "sync" ? "Synkar…" : "Synka nu"}
              </button>
              <button
                onClick={disconnect}
                disabled={!!busy}
                className={`${button} text-[var(--muted)]`}
                title="Koppla från banken"
              >
                <Unlink size={13} />
              </button>
            </>
          )}
          {(!active || (daysLeft !== null && daysLeft <= RENEW_WARNING_DAYS)) && (
            <button
              onClick={connect}
              disabled={!!busy}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Link2 size={13} />
              {busy === "connect"
                ? "Öppnar banken…"
                : connection
                  ? `Koppla om ${name}`
                  : `Koppla ${name}`}
            </button>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
    </div>
  );
}

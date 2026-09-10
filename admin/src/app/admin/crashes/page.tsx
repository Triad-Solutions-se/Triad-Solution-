"use client";

/**
 * Krascher — central crash feed for all Triad apps.
 * Reads crash_reports (+ analytics_apps for names) from this project's
 * database; reports are ingested by the report-crash edge function.
 * Grouped by fingerprint; status updates apply to the whole group.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Bug, RefreshCw } from "lucide-react";

type CrashStatus = "open" | "resolved" | "ignored";

type CrashReport = {
  id: string;
  app_id: string;
  environment: string;
  message: string;
  stack: string | null;
  error_type: string | null;
  url: string | null;
  user_agent: string | null;
  release: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint: string;
  status: CrashStatus;
  created_at: string;
  analytics_apps: { name: string; slug: string } | null;
};

type CrashGroup = {
  fingerprint: string;
  appName: string;
  appSlug: string;
  environment: string;
  message: string;
  errorType: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: CrashStatus;
  latest: CrashReport;
  reports: CrashReport[];
};

const STATUS_LABEL: Record<CrashStatus, string> = {
  open: "Öppen",
  resolved: "Löst",
  ignored: "Ignorerad",
};

const STATUS_STYLES: Record<CrashStatus, string> = {
  open: "bg-red-500/15 text-red-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  ignored: "bg-white/10 text-gray-400",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s} s sedan`;
  if (s < 3600) return `${Math.floor(s / 60)} min sedan`;
  if (s < 86400) return `${Math.floor(s / 3600)} h sedan`;
  return `${Math.floor(s / 86400)} d sedan`;
}

export default function CrashesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<CrashReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CrashStatus>("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("crash_reports")
      .select("*, analytics_apps(name, slug)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) setError(error.message);
    else setReports((data as unknown as CrashReport[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<CrashGroup[]>(() => {
    const map = new Map<string, CrashGroup>();
    for (const r of reports) {
      const g = map.get(r.fingerprint);
      if (!g) {
        map.set(r.fingerprint, {
          fingerprint: r.fingerprint,
          appName: r.analytics_apps?.name ?? "okänd app",
          appSlug: r.analytics_apps?.slug ?? "okand",
          environment: r.environment,
          message: r.message,
          errorType: r.error_type,
          count: 1,
          firstSeen: r.created_at,
          lastSeen: r.created_at,
          status: r.status,
          latest: r,
          reports: [r],
        });
      } else {
        g.count++;
        g.reports.push(r);
        if (r.created_at < g.firstSeen) g.firstSeen = r.created_at;
        if (r.status === "open") g.status = "open";
      }
    }
    return [...map.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }, [reports]);

  const apps = useMemo(() => [...new Set(groups.map((g) => g.appSlug))].sort(), [groups]);

  const visible = groups.filter(
    (g) =>
      (appFilter === "all" || g.appSlug === appFilter) &&
      (statusFilter === "all" || g.status === statusFilter),
  );

  const openCount = groups.filter((g) => g.status === "open").length;

  async function setGroupStatus(group: CrashGroup, status: CrashStatus) {
    const prev = reports;
    setReports((rs) => rs.map((r) => (r.fingerprint === group.fingerprint ? { ...r, status } : r)));
    const { error } = await supabase
      .from("crash_reports")
      .update({ status })
      .eq("fingerprint", group.fingerprint);
    if (error) {
      setReports(prev);
      setError(`Kunde inte uppdatera status: ${error.message}`);
    }
  }

  const selectCls =
    "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm outline-none focus:border-white/25";

  return (
    <div>
      <PageHeader
        title="Krascher"
        subtitle="Kraschrapporter från alla appar, grupperade per fel"
        right={
          <div className="flex items-center gap-2">
            <select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} className={selectCls}>
              <option value="all">Alla appar</option>
              {apps.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={selectCls}
            >
              <option value="open">Öppna</option>
              <option value="resolved">Lösta</option>
              <option value="ignored">Ignorerade</option>
              <option value="all">Alla</option>
            </select>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm hover:bg-white/[0.08]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Uppdatera
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Bug className="h-4 w-4" />
        <span>
          <span className={openCount > 0 ? "font-semibold text-red-400" : "font-semibold text-emerald-400"}>
            {openCount}
          </span>{" "}
          öppna kraschgrupper
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-400">Laddar …</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">
          {statusFilter === "open" ? "Inga öppna krascher. 🎉" : "Inget att visa."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => (
            <li key={g.fingerprint} className="rounded-xl border border-white/8 bg-white/[0.03]">
              <button
                onClick={() => setExpanded(expanded === g.fingerprint ? null : g.fingerprint)}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium">{g.appName}</span>
                    <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLES[g.status]}`}>
                      {STATUS_LABEL[g.status]}
                    </span>
                    {g.environment !== "production" && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">
                        {g.environment}
                      </span>
                    )}
                    {g.latest.release && <span className="text-gray-500">v{g.latest.release}</span>}
                  </div>
                  <p className="truncate font-medium">
                    {g.errorType && <span className="text-red-400">{g.errorType}: </span>}
                    {g.message}
                  </p>
                  {g.latest.url && <p className="mt-0.5 truncate text-xs text-gray-500">{g.latest.url}</p>}
                </div>
                <div className="shrink-0 text-right text-xs text-gray-500">
                  <p className="text-sm font-semibold text-gray-200">×{g.count}</p>
                  <p>{timeAgo(g.lastSeen)}</p>
                </div>
              </button>

              {expanded === g.fingerprint && (
                <div className="border-t border-white/8 p-4">
                  <div className="mb-3 flex gap-2">
                    {g.status !== "resolved" && (
                      <button
                        onClick={() => void setGroupStatus(g, "resolved")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                      >
                        Markera löst
                      </button>
                    )}
                    {g.status !== "ignored" && (
                      <button
                        onClick={() => void setGroupStatus(g, "ignored")}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/[0.06]"
                      >
                        Ignorera
                      </button>
                    )}
                    {g.status !== "open" && (
                      <button
                        onClick={() => void setGroupStatus(g, "open")}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/[0.06]"
                      >
                        Öppna igen
                      </button>
                    )}
                  </div>

                  {g.latest.stack && (
                    <pre className="mb-3 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-gray-300">
                      {g.latest.stack}
                    </pre>
                  )}

                  <div className="grid gap-1 text-xs text-gray-400 sm:grid-cols-2">
                    <p>Först sedd: {new Date(g.firstSeen).toLocaleString("sv-SE")}</p>
                    <p>Senast sedd: {new Date(g.lastSeen).toLocaleString("sv-SE")}</p>
                    {g.latest.user_agent && <p className="sm:col-span-2">Enhet: {g.latest.user_agent}</p>}
                    {g.latest.metadata && Object.keys(g.latest.metadata).length > 0 && (
                      <pre className="overflow-auto rounded bg-black/30 p-2 sm:col-span-2">
                        {JSON.stringify(g.latest.metadata, null, 2)}
                      </pre>
                    )}
                  </div>

                  {g.count > 1 && (
                    <details className="mt-3 text-xs text-gray-400">
                      <summary className="cursor-pointer select-none">Alla {g.count} förekomster</summary>
                      <ul className="mt-2 space-y-1">
                        {g.reports.map((r) => (
                          <li key={r.id} className="flex justify-between gap-2 border-b border-white/8 py-1 last:border-0">
                            <span className="truncate">{r.url ?? r.message}</span>
                            <span className="shrink-0">{new Date(r.created_at).toLocaleString("sv-SE")}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

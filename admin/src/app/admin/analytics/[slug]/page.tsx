import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft } from "lucide-react";
import {
  countSince,
  lastNDays,
  normalizeReferrer,
  seriesByDay,
  topBy,
  uniqueSessionsSince,
  type Row,
} from "../lib";

export const dynamic = "force-dynamic";

type AppRow = {
  id: string;
  slug: string;
  name: string;
  origin: string | null;
};

export default async function AppAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: appData } = await supabase
    .from("analytics_apps")
    .select("id,slug,name,origin")
    .eq("slug", slug)
    .maybeSingle();
  const app = appData as AppRow | null;
  if (!app) notFound();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("analytics_pageviews")
    .select(
      "app_id,path,referrer,session_id,country,region,city,device,browser,os,is_bot,created_at",
    )
    .eq("app_id", app.id)
    .eq("is_bot", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50000);

  const rows = (data ?? []) as Row[];
  const days = lastNDays(14);
  const series = seriesByDay(rows, days);
  const max = Math.max(1, ...series);

  const v24 = countSince(rows, 24);
  const v7 = countSince(rows, 24 * 7);
  const v30 = rows.length;
  const u7 = uniqueSessionsSince(rows, 24 * 7);

  const last7 = rows.filter(
    (r) => new Date(r.created_at).getTime() >= Date.now() - 7 * 24 * 3600 * 1000,
  );
  const topPaths = topBy(last7, (r) => r.path, 8);
  const topReferrers = topBy(last7, (r) => normalizeReferrer(r.referrer), 8);
  const topCountries = topBy(last7, (r) => r.country, 8);
  const topCities = topBy(
    last7,
    (r) => (r.city ? `${r.city}${r.country ? ", " + r.country : ""}` : null),
    8,
  );
  const topDevices = topBy(last7, (r) => r.device, 5);
  const topBrowsers = topBy(last7, (r) => r.browser, 8);
  const topOS = topBy(last7, (r) => r.os, 8);

  return (
    <>
      <Link
        href="/admin/analytics"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-white mb-3"
      >
        <ArrowLeft size={14} /> Tillbaka
      </Link>
      <PageHeader title={app.name} subtitle={app.origin ?? app.slug} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Senaste 24h" value={v24} />
        <StatCard label="Senaste 7 dagar" value={v7} />
        <StatCard label="Senaste 30 dagar" value={v30} />
        <StatCard label="Unika besökare 7d" value={u7} />
      </div>

      <section className="glass rounded-xl border border-white/10 p-5 mb-6">
        <h2 className="font-heading font-semibold mb-4">Besök senaste 14 dagarna</h2>
        <div className="flex items-end gap-1 h-32">
          {series.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="flex-1 w-full flex items-end">
                <div
                  title={`${days[i]}: ${v}`}
                  className="w-full bg-teal-400/50 hover:bg-teal-400/70 rounded-sm transition-colors"
                  style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
                />
              </div>
              <div className="text-[10px] text-[var(--muted)] tabular-nums">
                {days[i].slice(5)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <TopList title="Toppsidor (7d)" items={topPaths} />
        <TopList title="Referrer (7d)" items={topReferrers} emptyHint="Direkt-trafik visas inte här." />
        <TopList title="Länder (7d)" items={topCountries} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <TopList title="Städer (7d)" items={topCities} emptyHint="Stad detekteras endast på Vercel-deploys." />
        <TopList title="Enheter (7d)" items={topDevices} />
        <TopList title="Operativsystem (7d)" items={topOS} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <TopList title="Webbläsare (7d)" items={topBrowsers} />
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-xl border border-white/10 p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div className="font-heading text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function TopList({
  title,
  items,
  emptyHint,
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
  emptyHint?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="glass rounded-xl border border-white/10 p-5">
      <h2 className="font-heading font-semibold mb-3">{title}</h2>
      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          {emptyHint ?? "Ingen data än."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate min-w-0 flex-1" title={it.key}>
                  {it.key}
                </span>
                <span className="text-xs tabular-nums text-[var(--muted)] shrink-0">
                  {it.count}
                </span>
              </div>
              <div className="h-1 mt-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-teal-400/50"
                  style={{ width: `${(it.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

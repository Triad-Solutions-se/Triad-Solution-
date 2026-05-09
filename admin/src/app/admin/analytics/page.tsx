import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { NewAppButton } from "./NewAppButton";
import { BarChart3, ChevronRight, Activity } from "lucide-react";
import {
  countSince,
  lastNDays,
  seriesByDay,
  uniqueSessionsSince,
  type Row,
} from "./lib";

export const dynamic = "force-dynamic";

type AppRow = {
  id: string;
  slug: string;
  name: string;
  origin: string | null;
};

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [appsRes, rowsRes] = await Promise.all([
    supabase
      .from("analytics_apps")
      .select("id,slug,name,origin")
      .order("name"),
    supabase
      .from("analytics_pageviews")
      .select(
        "app_id,path,referrer,session_id,country,region,city,device,browser,os,is_bot,created_at",
      )
      .gte("created_at", since)
      .eq("is_bot", false)
      .order("created_at", { ascending: false })
      .limit(50000),
  ]);

  const apps = (appsRes.data ?? []) as AppRow[];
  const rows = (rowsRes.data ?? []) as Row[];
  const days = lastNDays(14);

  const byApp = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byApp.get(r.app_id) ?? [];
    arr.push(r);
    byApp.set(r.app_id, arr);
  }

  return (
    <>
      <PageHeader
        title="Analys"
        subtitle="Lättviktig trafikstatistik från registrerade appar."
        right={<NewAppButton />}
      />

      {apps.length === 0 ? (
        <div className="glass rounded-xl border border-white/10 p-10 text-center">
          <Activity size={28} className="mx-auto text-[var(--muted)] mb-3" />
          <p className="text-sm font-medium">Inga appar registrerade än.</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Klicka på "Ny app" och lägg till en slug. Lägg sedan in beacon-skriptet i appen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => {
            const r = byApp.get(app.id) ?? [];
            const series = seriesByDay(r, days);
            const max = Math.max(1, ...series);
            const v24 = countSince(r, 24);
            const v7 = countSince(r, 24 * 7);
            const v30 = r.length;
            const u7 = uniqueSessionsSince(r, 24 * 7);
            return (
              <Link
                key={app.id}
                href={`/admin/analytics/${app.slug}`}
                className="glass rounded-xl border border-white/10 p-5 flex items-center gap-5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-teal-400/15 text-teal-300 flex items-center justify-center shrink-0">
                  <BarChart3 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{app.name}</div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {app.origin ?? app.slug}
                  </div>
                </div>
                <div className="hidden md:flex items-end gap-0.5 h-10 w-32">
                  {series.map((v, i) => (
                    <div
                      key={i}
                      title={`${days[i]}: ${v}`}
                      className="flex-1 bg-teal-400/40 rounded-sm"
                      style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
                    />
                  ))}
                </div>
                <Stat label="24h" value={v24} />
                <Stat label="7d" value={v7} />
                <Stat label="30d" value={v30} />
                <Stat label="Unika 7d" value={u7} />
                <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="hidden sm:block text-right shrink-0 w-16">
      <div className="font-heading font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

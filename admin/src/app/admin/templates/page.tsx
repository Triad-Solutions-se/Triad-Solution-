import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { FileText, FileSpreadsheet, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();

  const [docsRes, offersRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("is_template", true),
    supabase.from("offers").select("id", { count: "exact", head: true }),
  ]);

  const docsCount = docsRes.count ?? 0;
  // offers-tabellen kanske inte finns ännu (migration 0015 ej körd) — fallback till 0
  const offersCount = offersRes.error ? 0 : offersRes.count ?? 0;

  const cards = [
    {
      href: "/admin/templates/dokument",
      title: "Dokumentmallar",
      desc: "Återanvändbara mötes- och projektmallar i TipTap-format.",
      icon: FileText,
      count: docsCount,
    },
    {
      href: "/admin/templates/offerter",
      title: "Offerter",
      desc: "Skapa kundoffert med projektkostnad (engång) och underhållsavgift (månad). Export till Excel.",
      icon: FileSpreadsheet,
      count: offersCount,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mallar"
        subtitle="Återanvändbara dokument och offert-mallar."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="glass rounded-card p-6 hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-teal-400/15 text-teal-300 flex items-center justify-center shrink-0">
                  <Icon size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-heading text-lg font-semibold">
                      {c.title}
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-[var(--muted)] group-hover:text-white transition-colors"
                    />
                  </div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    {c.desc}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-3">
                    {c.count} st
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { FileText, FileSpreadsheet, FileSignature, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();

  const [docsRes, offersRes, agreementsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("is_template", true),
    supabase.from("offers").select("id", { count: "exact", head: true }),
    supabase.from("agreements").select("id", { count: "exact", head: true }),
  ]);

  const docsCount = docsRes.count ?? 0;
  // offers/agreements-tabellerna kanske inte finns ännu (migration ej körd) — fallback till 0
  const offersCount = offersRes.error ? 0 : offersRes.count ?? 0;
  const agreementsCount = agreementsRes.error ? 0 : agreementsRes.count ?? 0;

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
    {
      href: "/admin/templates/avtal",
      title: "Avtal",
      desc: "Skapa avtal från en offert + PUB-mall. Genererar Avtal + Villkor som en PDF och PUB-avtal som separat PDF.",
      icon: FileSignature,
      count: agreementsCount,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mallar"
        subtitle="Återanvändbara dokument och offert-mallar."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

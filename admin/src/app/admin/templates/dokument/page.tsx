import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/date";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DokumentTemplatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id,title,icon,updated_at")
    .eq("is_template", true)
    .order("title");

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/templates"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
        >
          <ChevronLeft size={14} /> Tillbaka till Mallar
        </Link>
      </div>
      <PageHeader
        title="Dokumentmallar"
        subtitle="Återanvändbara mötes- och projektmallar."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((d: any) => (
          <Link
            key={d.id}
            href={`/admin/documents/${d.id}`}
            className="glass rounded-card p-5 hover:bg-white/[0.03] transition-colors"
          >
            <div className="text-2xl mb-2">{d.icon ?? "📄"}</div>
            <div className="font-heading font-semibold">{d.title}</div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Uppdaterad {fmtDate(d.updated_at)}
            </div>
          </Link>
        ))}
        {!data?.length && (
          <div className="text-sm text-[var(--muted)] py-6">Inga mallar än.</div>
        )}
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LeadsManager, type Lead } from "./LeadsManager";

export const dynamic = "force-dynamic";

export default async function ProjectLeadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, leadsRes] = await Promise.all([
    supabase.from("projects").select("id,name").eq("id", id).maybeSingle(),
    supabase
      .from("leads")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const project = projectRes.data as { id: string; name: string } | null;
  if (!project) notFound();

  const leads = (leadsRes.data ?? []) as Lead[];

  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link
          href={`/admin/projects/${project.id}`}
          className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          Tillbaka till {project.name}
        </Link>
      </div>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-1">
          {project.name}
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
          Cold call leads
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Ladda upp en Excel- eller CSV-fil med leads och markera dem som
          uppföljning, möte eller inget lead.
        </p>
      </header>

      <section className="glass rounded-card p-5">
        <LeadsManager projectId={project.id} initial={leads} />
      </section>
    </>
  );
}

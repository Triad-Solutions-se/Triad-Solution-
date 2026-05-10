import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PitchView } from "./PitchView";

export const dynamic = "force-dynamic";

export default async function ProjectPitchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id,name,sales_pitch")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  return (
    <PitchView
      projectId={project.id}
      projectName={project.name}
      initialPitch={(project as any).sales_pitch ?? null}
    />
  );
}

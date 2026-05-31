// DELETE /admin/api/pub-templates/[id] — radera mall + tillhörande fil.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template, error: fetchError } = await supabase
    .from("pub_templates")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Mall hittades inte." }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("pub_templates")
    .delete()
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (template.file_path) {
    // Best-effort: ignorera fel — DB-raden är borta så filen är "orphan".
    await supabase.storage.from("pub-templates").remove([template.file_path]);
  }

  return NextResponse.json({ ok: true });
}

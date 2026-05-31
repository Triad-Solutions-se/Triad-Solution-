// POST /admin/api/pub-templates — ladda upp en .docx-mall, parsa, spara
// fil i `pub-templates`-bucket + rad i pub_templates med extracted_blocks.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDocxToBlocks } from "@/lib/docx-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function slugifyName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: any) {
    return NextResponse.json(
      { error: "Förväntade multipart/form-data: " + (e?.message ?? String(e)) },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const description = (form.get("description") as string | null)?.trim() ?? "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Filen saknas." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Namnet saknas." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Filen är för stor (max ${(MAX_SIZE / 1024 / 1024).toFixed(0)} MB).` },
      { status: 400 },
    );
  }
  const isDocx =
    file.name.toLowerCase().endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!isDocx) {
    return NextResponse.json(
      { error: "Endast .docx-filer stöds." },
      { status: 400 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  // 1. Parsa docx → block-struktur
  let parsed;
  try {
    parsed = await parseDocxToBlocks(buf);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Kunde inte tolka docx-filen: " + (e?.message ?? String(e)) },
      { status: 400 },
    );
  }
  if (parsed.blocks.length === 0) {
    return NextResponse.json(
      { error: "Filen verkar tom (inga paragrafer hittades)." },
      { status: 400 },
    );
  }

  // 2. Ladda upp filen till storage. Filnamn: <timestamp>_<slug>.docx
  const ts = Date.now();
  const storagePath = `${ts}_${slugifyName(file.name)}`;
  const upload = await supabase.storage
    .from("pub-templates")
    .upload(storagePath, buf, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
  if (upload.error) {
    return NextResponse.json(
      {
        error:
          "Storage-uppladdning misslyckades: " +
          upload.error.message +
          " (verifiera att 'pub-templates'-bucketen finns — kör migration 0019)",
      },
      { status: 500 },
    );
  }

  // 3. Skapa raden i pub_templates
  const insert = await supabase
    .from("pub_templates")
    .insert({
      name,
      description: description || null,
      file_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      extracted_blocks: parsed.blocks,
      is_active: true,
    })
    .select("id")
    .single();

  if (insert.error) {
    // Försök städa upp den uppladdade filen
    await supabase.storage.from("pub-templates").remove([storagePath]);
    return NextResponse.json(
      { error: "Kunde inte spara mall: " + insert.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: insert.data.id, blockCount: parsed.blocks.length });
}

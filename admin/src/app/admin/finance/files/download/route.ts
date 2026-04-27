import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set(["finance", "brand-assets"]);

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const bucket = req.nextUrl.searchParams.get("bucket") ?? "finance";
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.redirect(new URL("/admin/login", req.url));

  const filename = path.split("/").pop() ?? "file";
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60, { download: filename });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}

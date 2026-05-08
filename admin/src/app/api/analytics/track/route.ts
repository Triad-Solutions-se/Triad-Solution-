import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|slackbot|twitterbot|discordbot|whatsapp|telegrambot|preview|lighthouse|headlesschrome/i;

type Payload = {
  app_slug?: unknown;
  path?: unknown;
  referrer?: unknown;
  session_id?: unknown;
};

function clipString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const slug = clipString(body.app_slug, 64);
  const path = clipString(body.path, 512);
  if (!slug || !path) {
    return NextResponse.json(
      { error: "missing_fields" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const referrer = clipString(body.referrer, 1024);
  const sessionId = clipString(body.session_id, 64);
  const userAgent = clipString(req.headers.get("user-agent"), 512);
  const country =
    clipString(req.headers.get("x-vercel-ip-country"), 8) ??
    clipString(req.headers.get("cf-ipcountry"), 8);
  const isBot = userAgent ? BOT_RE.test(userAgent) : false;

  const supabase = createAdminClient();

  const { data: app, error: appErr } = await supabase
    .from("analytics_apps")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (appErr) {
    return NextResponse.json(
      { error: "lookup_failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
  if (!app) {
    return NextResponse.json(
      { error: "unknown_app" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { error: insertErr } = await supabase.from("analytics_pageviews").insert({
    app_id: (app as { id: string }).id,
    path,
    referrer,
    session_id: sessionId,
    country,
    user_agent: userAgent,
    is_bot: isBot,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "insert_failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

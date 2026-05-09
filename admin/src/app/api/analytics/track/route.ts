import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUA, decodeEdgeHeader } from "./ua";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow the apex and any *.triadsolutions.se subdomain (white-label tenants).
function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "triadsolutions.se" ||
      u.hostname.endsWith(".triadsolutions.se")
    );
  } catch {
    return false;
  }
}

// sendBeacon always sends with credentials, so we can't use Allow-Origin: *.
// Echo the request Origin if it's allowlisted; otherwise omit Allow-Origin
// (server-to-server callers without an Origin header still work — CORS only
// applies in browsers).
function corsHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = req.headers.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

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

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: cors },
    );
  }

  // Slugs are stored lowercase (see NewAppButton); match case-insensitively
  // so beacons like "Smashboard" still resolve.
  const slug = clipString(body.app_slug, 64)?.toLowerCase() ?? null;
  const path = clipString(body.path, 512);
  if (!slug || !path) {
    return NextResponse.json(
      { error: "missing_fields" },
      { status: 400, headers: cors },
    );
  }

  const referrer = clipString(body.referrer, 1024);
  const sessionId = clipString(body.session_id, 64);
  const userAgent = clipString(req.headers.get("user-agent"), 512);
  const country =
    clipString(req.headers.get("x-vercel-ip-country"), 8) ??
    clipString(req.headers.get("cf-ipcountry"), 8);
  const region = clipString(
    req.headers.get("x-vercel-ip-country-region"),
    16,
  );
  const city = clipString(
    decodeEdgeHeader(req.headers.get("x-vercel-ip-city")),
    128,
  );
  const isBot = userAgent ? BOT_RE.test(userAgent) : false;
  const { device, browser, os } = parseUA(userAgent);

  const supabase = createAdminClient();

  const { data: app, error: appErr } = await supabase
    .from("analytics_apps")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (appErr) {
    return NextResponse.json(
      { error: "lookup_failed" },
      { status: 500, headers: cors },
    );
  }
  if (!app) {
    return NextResponse.json(
      { error: "unknown_app" },
      { status: 404, headers: cors },
    );
  }

  const { error: insertErr } = await supabase.from("analytics_pageviews").insert({
    app_id: (app as { id: string }).id,
    path,
    referrer,
    session_id: sessionId,
    country,
    region,
    city,
    user_agent: userAgent,
    device,
    browser,
    os,
    is_bot: isBot,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "insert_failed" },
      { status: 500, headers: cors },
    );
  }

  return NextResponse.json({ ok: true }, { headers: cors });
}

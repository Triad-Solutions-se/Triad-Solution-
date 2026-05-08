# Triad Analytics — per-app beacon

The Triad admin portal collects lightweight pageview analytics from registered
apps. Each app POSTs to `/api/analytics/track` on the admin host. Apps must be
registered first under **Admin → Analys → Ny app** to get a `slug`.

## Setup checklist

1. Run migration `0009_analytics.sql` against your Supabase project.
2. Set `SUPABASE_SERVICE_ROLE_KEY` in the admin host env (Vercel project
   settings → Environment Variables). The ingest endpoint needs this to bypass
   RLS when inserting pageviews.
3. Register the app in **Admin → Analys → Ny app** (pick a short slug, e.g.
   `marketing-site`).
4. Add the beacon to the app — see prompt below.
5. Deploy the app. Hits show up under `/admin/analytics/<slug>` within seconds.

## Endpoint

`POST https://<admin-host>/api/analytics/track`

Body (JSON):

```json
{
  "app_slug": "marketing-site",
  "path": "/about",
  "referrer": "https://google.com/search?q=...",
  "session_id": "ab12cd34"
}
```

CORS is open (`*`) so the beacon can fire from any origin. Bots are detected
server-side via User-Agent and stored with `is_bot=true` (filtered out of the
dashboard). Country is derived from `x-vercel-ip-country` / `cf-ipcountry`
headers when present.

## Drop-in prompt for each app

Paste this into a Claude Code session opened inside the target app:

> Add a lightweight first-party pageview beacon to this app.
>
> - On every client-side route change (and on first load), POST to
>   `https://<admin-host>/api/analytics/track` with a JSON body containing
>   `app_slug` (use `"<slug>"`), `path` (current pathname + search), `referrer`
>   (`document.referrer || null`), and `session_id` (a short random string
>   stored in `sessionStorage` under `triad_sid`, generated on first hit).
> - Use `navigator.sendBeacon` when available, fall back to
>   `fetch(url, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })`.
> - Skip when `process.env.NODE_ENV !== "production"` and when the page is
>   prerendered server-side. No external libraries.
> - For Next.js App Router: implement as a small client component mounted
>   once in the root layout that listens to `usePathname()` / `useSearchParams()`.
> - For Next.js Pages Router: subscribe to `router.events.on("routeChangeComplete")`.
> - For plain HTML / static sites: a single inline `<script>` in `<head>` that
>   fires once on `DOMContentLoaded`.
>
> Replace `<admin-host>` with the actual admin URL and `<slug>` with the slug
> registered in Triad admin. Keep the implementation under 50 lines. Do not
> include user-identifying data in `session_id` — it is just a per-tab
> identifier for unique-visitor counting.

## Schema reference

```
analytics_apps        slug, name, origin, created_at
analytics_pageviews   app_id, path, referrer, session_id, country,
                      user_agent, is_bot, created_at
```

See `supabase/migrations/0009_analytics.sql` for full DDL and RLS.

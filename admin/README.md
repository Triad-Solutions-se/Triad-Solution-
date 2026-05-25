# Triad Admin

Invite-only admin at `triadsolutions.se/admin`. Next.js 15 App Router + Supabase SSR + TipTap.

## Modules
Översikt · Uppgifter (kanban) · Projekt · Möten (kalender + lista) · Kunder · Dokument (TipTap) · Ekonomi · Grafisk Profil · Mallar (Dokumentmallar + Offerter).

### Offerter (under Mallar)
Skapa kundoffert med två fasta priskolumner — `project_price` (engångsavgift) och `monthly_price` (underhåll/månad). Live-uträkning av delsumma, moms och totaler i admin-UI:t. Export till Excel via `/admin/api/offers/[id]/export` — branded layout, live SUM-formler i kalkylbladet, A4 utskriftsklar. Statusflöde: utkast → skickad → accepterad/avslagen/utgången. Schema i `supabase/migrations/0015_offers.sql`; kör den migrationen i Supabase SQL-editorn för att aktivera modulen. Offertnummer auto-genereras per kalenderår (`YYYY-NNN`).

## Local setup
```bash
cd admin
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev                         # http://localhost:3100/admin
```

## Supabase bootstrap
1. Create a project named `triad-admin` in the Pro org, region `eu-north-1`.
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql` then `supabase/migrations/0002_seed.sql`.
3. **Disable public signups**: Authentication → Providers → Email → toggle off "Enable Signups". Invite-only is enforced by RLS (`profiles` membership + `is_member()`).
4. Invite founders via Authentication → Users → Invite user (rayan/sahil/firas). The `on_auth_user_created` trigger auto-creates profile rows.

## Deployment
The main marketing site (`/index.html`) is untouched. `vercel.json` at the repo root rewrites `/admin/*` to a separate Vercel project that deploys this `admin/` folder.

1. Create a new Vercel project, root directory = `admin/`.
2. Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy — note the production URL (e.g. `triad-admin.vercel.app`).
4. If that URL differs, update `vercel.json` at the repo root.
5. Redeploy the main site to activate the rewrite.

## Auth flow
- `src/middleware.ts` redirects unauthenticated requests to `/admin/login?next=<path>`.
- Login supports both password and magic link.
- `src/app/admin/auth/callback/route.ts` exchanges the magic-link code.
- Access control is defense-in-depth: middleware blocks routes, RLS blocks data.

## Files of note
- `next.config.js` — `basePath: '/admin'`
- `src/lib/supabase/{server,client}.ts` — Supabase SSR + browser clients
- `supabase/migrations/0001_init.sql` — schema + RLS
- `supabase/migrations/0002_seed.sql` — Notion-sourced docs & templates

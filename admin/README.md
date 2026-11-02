# Triad Admin

Invite-only admin at `portal.mcasolutions.se/admin` (also reachable as `www.mcasolutions.se/admin`). Next.js 15 App Router + Supabase SSR + TipTap.

## Modules
Översikt · Uppgifter (kanban) · Projekt · Möten (kalender + lista) · Kunder · Dokument (TipTap) · Ekonomi · Grafisk Profil · Mallar (Dokumentmallar + Offerter).

### Offerter (under Mallar)
Skapa kundoffert med två fasta priskolumner — `project_price` (engångsavgift) och `monthly_price` (underhåll/månad). Live-uträkning av delsumma, moms och totaler i admin-UI:t. Export till Excel via `/admin/api/offers/[id]/export` — branded layout, live SUM-formler i kalkylbladet, A4 utskriftsklar. Statusflöde: utkast → skickad → accepterad/avslagen/utgången. Schema i `supabase/migrations/0015_offers.sql`; kör den migrationen i Supabase SQL-editorn för att aktivera modulen. Offertnummer auto-genereras per kalenderår (`YYYY-NNN`).

### Fakturor
Kundfakturor under `/admin/invoices`, kopplade till kund, offert och avtal. Skapa från fakturalistan, från en kund ("Fakturera" i kundlistan) eller från offert-/avtalssidan — engångskostnad och/eller månadsavgift hämtas från offerten, med leveransperiod. Fakturanummer (`YYYY-NNN` per kalenderår) och OCR-nummer (fakturanumrets siffror + längdsiffra + Luhn-kontrollsiffra) sätts av databasen och är unika. PDF via `/admin/api/invoices/[id]/pdf` med bankgiro, OCR, momsreg.nr, F-skatt och styrelsens säte. Statusflöde: utkast → skickad (låst) → betald, eller kreditera med kreditfaktura; "Förfallen" räknas fram efter förfallodagen. Bara utkast kan raderas. Bankgiro, momsreg.nr m.m. fylls i under Inställningar → Fakturering. Schema i `supabase/migrations/0034_invoice_system.sql`.

### Ekonomin hänger ihop
Offert → avtal → fakturor → intäkter, med länkar åt båda håll (offertsidan visar sina avtal, avtalssidan sin offert, fakturan sitt avtal/sin offert/sin återkommande fakturering). Schema i `supabase/migrations/0036_economy_links_recurring_billing.sql`.

- **Betalda fakturor bokförs som intäkter.** När en faktura registreras som betald (välj bankkonto i betalningsrutan) skapar en databastrigger en intäkt i Ekonomi med fakturans belopp inkl. moms, så Kassa, Intäkter och Cashflow stämmer utan dubbelregistrering. Ångrad betalning, återställt utkast eller kreditering tar bort intäkten. På sådana intäkter kan bara projekt och bankkonto ändras.
- **Återkommande fakturering.** Under Ekonomi → Återkommande intäkt, eller "Lägg upp" på avtals-/offertsidan: kund, avtal/offert, frekvens (månadsvis, kvartalsvis, halvårsvis, årsvis), fakturarader per period (hämtas från offertens återkommande kostnad × periodens månader), moms, betalningsvillkor och förskott (utkast X dagar före perioden) eller efterskott (dagen efter). Ett fakturautkast per period skapas automatiskt när Ekonomi, Fakturor, en offert eller ett avtal öppnas, och dyker upp under Fakturor för granskning. "Fakturera nästa period nu" skapar nästa utkast direkt. Raderade utkast skapas inte igen. När ett avtal sätts till Avslutad pausas dess återkommande fakturering. Läget "Endast intäkt" fungerar som tidigare (intäktsrader utan faktura).
- **Offertens faktureringsintervall** ("Underhållet faktureras") står i offert-PDF/Excel och avtalet och blir förval för avtalets återkommande fakturering.
- Ekonomi visar "Återkommande / mån" (alla aktiva planer omräknade per månad), och kundlistan visar återkommande intäkt per kund.

### Fakturamejl
Fakturor mejlas med PDF:en bifogad via [Resend](https://resend.com): "Slutför och skicka med e-post" på ett utkast, "Skicka med e-post" på en skickad faktura, och automatiskt för återkommande fakturering med "Mejla fakturorna automatiskt" påslaget. Varje morgon (06:00 UTC) anropar Vercel Cron `/api/cron/invoices`, som skapar periodernas utkast och mejlar dem för planer med automatiskt utskick (och markerar dem som skickade). Ett misslyckat utskick görs inte om automatiskt — felet syns på planen och i fakturans utskickslogg, och fakturan skickas för hand när det är åtgärdat. Schema i `supabase/migrations/0038_recurring_invoice_email.sql`.

Miljövariabler i Vercel (triad-admin):
- `RESEND_API_KEY` — från Resend, med domänen mcasolutions.se verifierad (DNS-poster för SPF/DKIM).
- `INVOICE_EMAIL_FROM` — t.ex. `MCA Solutions <faktura@mcasolutions.se>`. Svar går till företagets e-post under Inställningar.
- `INVOICE_EMAIL_BCC` (valfri) — kopia av varje fakturamejl.
- `CRON_SECRET` — valfri lång slumpsträng; Vercel skickar den till cron-routerna (samma hemlighet som banksynken använder).
- `SUPABASE_SERVICE_ROLE_KEY` — finns redan (används av analytics).

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

-- Säkerhetshärdning utifrån Supabase security advisor (2026-06).
-- Åtgärdar tre saker som rapporterades av databas-lintern:
--   1. RLS saknades på public.app_migrations (KRITISK — tabellen var fullt
--      exponerad mot anon/authenticated via PostgREST).
--   2. Sex funktioner hade muterbar search_path (privilege-escalation-vektor).
--   3. handle_new_user (en trigger på auth.users) gick att anropa som RPC.
--
-- is_member() lämnas medvetet orörd: den används i RLS-policyn på samtliga
-- tabeller och MÅSTE vara körbar av anon/authenticated för att policyn ska
-- fungera. Direktanrop avslöjar bara om den inloggade själv är medlem.

-- 1. KRITISK: aktivera RLS på intern migrationslogg.
--    Inga policys = anon/authenticated blockeras helt; service_role
--    (migrationskörningen) kringgår RLS och fungerar som vanligt.
alter table public.app_migrations enable row level security;

-- 2. Lås search_path på funktioner (samtliga refererar tabeller med explicit
--    public.-prefix, så tom search_path är säker).
alter function public.touch_updated_at()        set search_path = '';
alter function public.offers_set_defaults()     set search_path = '';
alter function public.next_offer_number()       set search_path = '';
alter function public.pub_templates_touch()     set search_path = '';
alter function public.next_agreement_number()   set search_path = '';
alter function public.agreements_set_defaults() set search_path = '';

-- 3. handle_new_user är endast en trigger på auth.users och ska inte gå att
--    anropa direkt. Triggrar kräver inte EXECUTE, så detta är säkert.
--    REVOKE från PUBLIC eftersom anon/authenticated ärver rätten därifrån.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

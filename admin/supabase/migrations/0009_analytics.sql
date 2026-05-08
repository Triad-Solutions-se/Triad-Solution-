-- Lightweight first-party analytics shared across Triad apps.
-- Each app registers itself with a slug; client beacons POST pageviews to
-- /api/analytics/track which inserts via the service role.

create table if not exists public.analytics_apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  origin text,           -- optional canonical origin, e.g. https://triadsolutions.se
  created_at timestamptz default now()
);

create table if not exists public.analytics_pageviews (
  id bigserial primary key,
  app_id uuid not null references public.analytics_apps(id) on delete cascade,
  path text not null,
  referrer text,
  session_id text,
  country text,
  user_agent text,
  is_bot boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_pageviews_app_created
  on public.analytics_pageviews (app_id, created_at desc);
create index if not exists idx_pageviews_app_session
  on public.analytics_pageviews (app_id, session_id, created_at desc);

alter table public.analytics_apps      enable row level security;
alter table public.analytics_pageviews enable row level security;

-- Members may read & manage app registrations from the admin UI.
drop policy if exists analytics_apps_member on public.analytics_apps;
create policy analytics_apps_member on public.analytics_apps
  for all using (public.is_member()) with check (public.is_member());

-- Members may read pageviews. Inserts happen server-side via service role
-- (which bypasses RLS), so no insert policy is exposed to clients.
drop policy if exists analytics_pageviews_select on public.analytics_pageviews;
create policy analytics_pageviews_select on public.analytics_pageviews
  for select using (public.is_member());

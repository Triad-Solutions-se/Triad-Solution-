-- Tidrapportering: start/stopp-timer per projekt. En rad per arbetspass;
-- ended_at null = timern går. Max en körande timer per person (partiellt
-- unikt index), så att starta på ett nytt projekt = byta projekt.
--
-- Start/stopp går via RPC (start_project_timer / stop_project_timer) så att
-- tiderna sätts av databasens klocka, inte telefonens, och så att bytet
-- mellan projekt sker i en och samma transaktion.

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  constraint time_entries_range check (ended_at is null or ended_at >= started_at)
);

create index if not exists time_entries_project_idx on public.time_entries (project_id, started_at desc);
create index if not exists time_entries_profile_idx on public.time_entries (profile_id, started_at desc);
create unique index if not exists time_entries_one_running
  on public.time_entries (profile_id) where ended_at is null;

-- Alla medlemmar ser all tid (för projekttotaler); man skriver bara sina egna pass.
alter table public.time_entries enable row level security;
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (public.is_member());
drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries
  for insert with check (public.is_member() and profile_id = auth.uid());
drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries
  for update using (public.is_member() and profile_id = auth.uid())
  with check (public.is_member() and profile_id = auth.uid());
drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries
  for delete using (public.is_member() and profile_id = auth.uid());

-- Startar timer på ett projekt för den inloggade. Stoppar först en ev.
-- körande timer (på vilket projekt som helst) — samma now() i hela
-- transaktionen, så det gamla passet slutar exakt när det nya börjar.
-- security invoker: RLS ovan gäller fullt ut.
create or replace function public.start_project_timer(p_project_id uuid)
returns public.time_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  update public.time_entries
     set ended_at = now()
   where profile_id = auth.uid() and ended_at is null;

  insert into public.time_entries (project_id, profile_id)
  values (p_project_id, auth.uid())
  returning * into entry;

  return entry;
end;
$$;

-- Stoppar den inloggades körande timer. Returnerar det avslutade passet
-- (eller null om ingen timer gick).
create or replace function public.stop_project_timer()
returns public.time_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  update public.time_entries
     set ended_at = now()
   where profile_id = auth.uid() and ended_at is null
  returning * into entry;

  return entry;
end;
$$;

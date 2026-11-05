-- Kalender: planerad arbetstid per medlem, i kvartsintervall.
--
-- Tiderna är väggklocka i svensk tid (datum + minut på dygnet), inte
-- timestamptz: ett pass 09:00–17:00 ska vara det oavsett sommartid och oavsett
-- vilken tidszon servern kör i. end_minute 1440 = 24:00.
--
-- Ett pass har ingen egen identitet utöver sin tid, så överlappande och
-- angränsande pass slås ihop i klienten. Databasen garanterar att en medlems
-- pass aldrig överlappar, annars skulle veckans timmar räknas dubbelt.

create extension if not exists btree_gist with schema extensions;

create table if not exists public.work_blocks (
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  work_date     date not null,
  start_minute  integer not null,
  end_minute    integer not null,
  created_at    timestamptz not null default now(),
  primary key (profile_id, work_date, start_minute),
  constraint work_blocks_range
    check (start_minute >= 0 and end_minute <= 1440 and end_minute > start_minute),
  constraint work_blocks_quarters
    check (start_minute % 15 = 0 and end_minute % 15 = 0),
  constraint work_blocks_no_overlap exclude using gist (
    profile_id with =,
    work_date with =,
    int4range(start_minute, end_minute) with &&
  )
);

create index if not exists work_blocks_date_idx on public.work_blocks (work_date);

-- Alla medlemmar ser allas plan; man skriver bara sin egen.
alter table public.work_blocks enable row level security;
drop policy if exists work_blocks_select on public.work_blocks;
create policy work_blocks_select on public.work_blocks
  for select using (public.is_member());
drop policy if exists work_blocks_insert on public.work_blocks;
create policy work_blocks_insert on public.work_blocks
  for insert with check (public.is_member() and profile_id = auth.uid());
drop policy if exists work_blocks_update on public.work_blocks;
create policy work_blocks_update on public.work_blocks
  for update using (public.is_member() and profile_id = auth.uid())
  with check (public.is_member() and profile_id = auth.uid());
drop policy if exists work_blocks_delete on public.work_blocks;
create policy work_blocks_delete on public.work_blocks
  for delete using (public.is_member() and profile_id = auth.uid());

-- Ersätter den inloggades pass på de angivna dagarna, i en och samma
-- transaktion: {"2026-11-02": [[540, 720], [780, 1020]], "2026-11-03": []}.
-- Att flytta ett pass mellan två dagar är alltså ett enda atomärt anrop.
-- security invoker: RLS ovan gäller fullt ut.
create or replace function public.save_work_plan(p_days jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.work_blocks
   where profile_id = auth.uid()
     and work_date in (select key::date from jsonb_each(p_days));

  insert into public.work_blocks (profile_id, work_date, start_minute, end_minute)
  select auth.uid(), day.key::date, (block->>0)::integer, (block->>1)::integer
    from jsonb_each(p_days) as day
   cross join lateral jsonb_array_elements(day.value) as block;
end;
$$;

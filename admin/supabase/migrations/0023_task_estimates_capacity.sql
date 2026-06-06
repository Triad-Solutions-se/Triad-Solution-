-- Supermind Fas 1: tidsuppskattning per uppgift + veckokapacitet per medlem.
-- Detta är råmaterialet supermind:en behöver för att planera arbete utifrån
-- hur många timmar vi faktiskt har.

-- Uppskattad arbetstid för en uppgift (timmar). Null = ej uppskattad.
alter table public.tasks
  add column if not exists estimate_hours numeric(6,2);

-- Hur många timmar per vecka varje medlem kan lägga. En rad per profil.
create table if not exists public.member_capacity (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  weekly_hours numeric(6,2) not null default 0,
  updated_at   timestamptz  not null default now()
);

alter table public.member_capacity enable row level security;
drop policy if exists member_capacity_member on public.member_capacity;
create policy member_capacity_member on public.member_capacity
  for all using (public.is_member()) with check (public.is_member());

-- Håll updated_at aktuell (touch_updated_at finns sedan 0001).
drop trigger if exists trg_member_capacity_updated on public.member_capacity;
create trigger trg_member_capacity_updated
  before update on public.member_capacity
  for each row execute function public.touch_updated_at();

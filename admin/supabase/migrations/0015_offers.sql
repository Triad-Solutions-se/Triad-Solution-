-- Offerter ("Mallar → Offert") — offers per kund med projektkostnad (engång)
-- och underhållsavgift (månad). Auto-genererat offertnummer (YYYY-NNN).

-- OFFERS --------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  offer_number text unique,                   -- t.ex. 2026-001 (auto)
  title text,                                 -- valfri titel/projektnamn
  customer_id uuid references public.customers(id) on delete set null,
  reference text,                             -- "Er referens" — kundens kontaktperson
  status text not null default 'draft',       -- draft | sent | accepted | rejected | expired
  offer_date date not null default current_date,
  valid_until date,                           -- giltig till
  project_description text,
  project_price numeric(14,2) not null default 0,    -- engångskostnad, exkl. moms
  monthly_price numeric(14,2) not null default 0,    -- underhåll/månad, exkl. moms
  vat_rate      numeric(5,2)  not null default 25.00,
  currency text not null default 'SEK',
  terms jsonb,                                -- valfri override av default-villkor
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offers_customer_idx on public.offers (customer_id);
create index if not exists offers_status_idx   on public.offers (status);
create index if not exists offers_date_idx     on public.offers (offer_date desc);

alter table public.offers enable row level security;
drop policy if exists offers_member on public.offers;
create policy offers_member on public.offers
  for all using (public.is_member()) with check (public.is_member());

-- Auto-numrering: YYYY-NNN per kalenderår.
-- Kollisionskydd via UNIQUE-constraint på offer_number; vid race-collision
-- retryas insert i klienten.
create or replace function public.next_offer_number() returns text
language plpgsql as $$
declare
  yr int := extract(year from current_date)::int;
  cnt int;
begin
  select coalesce(max(
    (regexp_match(offer_number, '^' || yr::text || '-(\d+)$'))[1]::int
  ), 0) + 1
    into cnt
    from public.offers
   where offer_number like (yr::text || '-%');
  return yr::text || '-' || lpad(cnt::text, 3, '0');
end;
$$;

create or replace function public.offers_set_defaults() returns trigger
language plpgsql as $$
begin
  if NEW.offer_number is null or NEW.offer_number = '' then
    NEW.offer_number := public.next_offer_number();
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists offers_before_insert on public.offers;
create trigger offers_before_insert
  before insert on public.offers
  for each row execute function public.offers_set_defaults();

drop trigger if exists offers_before_update on public.offers;
create trigger offers_before_update
  before update on public.offers
  for each row execute function public.offers_set_defaults();

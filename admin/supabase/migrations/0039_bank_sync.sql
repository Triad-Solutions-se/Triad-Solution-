-- Bankkoppling via Enable Banking (open banking, PSD2-kontoinformation).
--
-- bank_connections: en rad per bankmedgivande. Skapas som 'pending' när man
--   klickar "Koppla bank" (auth_state = slumpad state för redirect-rundan) och
--   blir 'active' när banken skickat tillbaka en kod och sessionen skapats.
--   Medgivandet gäller till valid_until (max ~180 dagar), sedan 'expired' och
--   man kopplar om med BankID.
-- bank_accounts.connection_id / provider_account_uid: vilket konto hos
--   Enable Banking ett bankkonto i portalen hämtar data från. uid gäller bara
--   inom en session; provider_account_hash är stabil mellan sessioner och
--   används för att hitta samma konto igen när man kopplar om.
-- bank_accounts.synced_balance*: saldot som banken senast rapporterade.
-- bank_transactions: transaktioner från banken. Bokförda (BOOK) sparas en
--   gång per external_id; reserverade (PDNG) byts ut vid varje synk.
--
-- Allt skrivs av servern (service role) — medlemmar får bara läsa.
-- Koden klarar sig utan tabellerna (bankkopplingen döljs) tills migrationen är körd.

create table if not exists public.bank_connections (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'enablebanking',
  aspsp_name     text not null,
  aspsp_country  text not null,
  psu_type       text not null default 'business',
  status         text not null default 'pending'
                 check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  auth_state     text unique,
  session_id     text unique,
  target_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  valid_until    timestamptz,
  last_synced_at timestamptz,
  last_error     text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
drop policy if exists bank_connections_select on public.bank_connections;
create policy bank_connections_select on public.bank_connections
  for select using (public.is_member());

alter table public.bank_accounts
  add column if not exists connection_id        uuid references public.bank_connections(id) on delete set null,
  add column if not exists provider_account_uid text unique,
  add column if not exists provider_account_hash text,
  add column if not exists synced_balance       numeric(14,2),
  add column if not exists synced_balance_type  text,
  add column if not exists synced_at            timestamptz;

create table if not exists public.bank_transactions (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  external_id     text not null,
  status          text not null default 'BOOK',
  booking_date    date,
  value_date      date,
  amount          numeric(14,2) not null,   -- + in, − ut
  currency        text not null default 'SEK',
  counterparty    text,
  description     text,
  reference       text,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  unique (bank_account_id, external_id)
);

create index if not exists bank_transactions_account_date_idx
  on public.bank_transactions (bank_account_id, booking_date desc);

alter table public.bank_transactions enable row level security;
drop policy if exists bank_transactions_select on public.bank_transactions;
create policy bank_transactions_select on public.bank_transactions
  for select using (public.is_member());

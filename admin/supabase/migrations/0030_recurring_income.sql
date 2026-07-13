-- Återkommande intäkter — speglar recurring_payments (0004) men på
-- intäktssidan: t.ex. månatliga underhållsavtal/SaaS-avgifter per kund.
-- Ren översiktstabell precis som recurring_payments; skapar inte
-- income-rader automatiskt.

create table if not exists public.recurring_income (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_sek numeric(12,2) not null default 0,
  source text,                                -- customer | grant | investment | other
  customer_id uuid references public.customers(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  frequency text not null default 'monthly',  -- monthly | quarterly | yearly
  next_due_date date,                         -- nästa förväntade betalning
  start_date date default current_date,
  end_date date,
  active boolean default true,
  notes text,
  created_at timestamptz default now()
);

create index if not exists recurring_income_customer_idx on public.recurring_income (customer_id);
create index if not exists recurring_income_project_idx  on public.recurring_income (project_id);
create index if not exists recurring_income_bank_idx     on public.recurring_income (bank_account_id);
create index if not exists recurring_income_active_idx   on public.recurring_income (active);

alter table public.recurring_income enable row level security;
drop policy if exists recurring_income_member on public.recurring_income;
create policy recurring_income_member on public.recurring_income
  for all using (public.is_member()) with check (public.is_member());

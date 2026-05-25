-- Economy upgrade: bank accounts, project links on every transaction.
-- Adds bank_accounts table and bank_account_id / project_id columns on
-- payments, income, expenses, invoices and recurring_payments so that the
-- Ekonomi page can show cashflow, derived balances, and per-project totals.

-- BANK ACCOUNTS -------------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_number text,
  bank text,
  currency text not null default 'SEK',
  starting_balance numeric(14,2) not null default 0,
  color text,                 -- hex like #0ea5e9 (optional, for UI)
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_member on public.bank_accounts;
create policy bank_accounts_member on public.bank_accounts
  for all using (public.is_member()) with check (public.is_member());

-- COLUMNS on existing finance tables ----------------------------------
alter table public.payments
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists project_id      uuid references public.projects(id)      on delete set null;

alter table public.recurring_payments
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists project_id      uuid references public.projects(id)      on delete set null;

alter table public.income
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists project_id      uuid references public.projects(id)      on delete set null;

alter table public.expenses
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null;
  -- expenses.project_id already exists from 0001_init.sql

alter table public.invoices
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists project_id      uuid references public.projects(id)      on delete set null;

create index if not exists payments_bank_idx           on public.payments (bank_account_id);
create index if not exists payments_project_idx        on public.payments (project_id);
create index if not exists recurring_bank_idx          on public.recurring_payments (bank_account_id);
create index if not exists recurring_project_idx       on public.recurring_payments (project_id);
create index if not exists income_bank_idx             on public.income (bank_account_id);
create index if not exists income_project_idx          on public.income (project_id);
create index if not exists expenses_bank_idx           on public.expenses (bank_account_id);
create index if not exists invoices_bank_idx           on public.invoices (bank_account_id);
create index if not exists invoices_project_idx        on public.invoices (project_id);

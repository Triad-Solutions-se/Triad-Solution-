-- Finance: payments, recurring payments, monthly file archive
-- Brand:   uploaded logo assets
-- Storage: 'finance' and 'brand-assets' buckets (members-only)

-- PAYMENTS ------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_sek numeric(12,2) not null default 0,
  category text,
  assignee_id uuid references public.profiles(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_path text,
  due_date date,
  paid_at date,
  status text default 'pending', -- pending | paid | overdue
  notes text,
  created_at timestamptz default now()
);
create index if not exists payments_assignee_idx on public.payments (assignee_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_due_idx on public.payments (due_date);

-- RECURRING PAYMENTS --------------------------------------------------
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_sek numeric(12,2) not null default 0,
  category text,
  assignee_id uuid references public.profiles(id) on delete set null,
  frequency text not null default 'monthly', -- monthly | quarterly | yearly
  next_due_date date,
  start_date date default current_date,
  end_date date,
  active boolean default true,
  notes text,
  created_at timestamptz default now()
);
create index if not exists recurring_payments_assignee_idx on public.recurring_payments (assignee_id);
create index if not exists recurring_payments_active_idx on public.recurring_payments (active);

-- FINANCE FILES (invoices/receipts archive by month) ------------------
create table if not exists public.finance_files (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  type text not null default 'receipt', -- invoice | receipt
  description text,
  amount_sek numeric(12,2),
  file_path text not null, -- path inside the 'finance' storage bucket
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz default now()
);
create index if not exists finance_files_year_month_idx on public.finance_files (year, month);

-- BRAND ASSETS (logos) ------------------------------------------------
create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  background text, -- 'light' | 'dark' | 'color'
  file_path text not null, -- path inside the 'brand-assets' storage bucket
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz default now()
);

-- RLS -----------------------------------------------------------------
alter table public.payments           enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.finance_files      enable row level security;
alter table public.brand_assets       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['payments','recurring_payments','finance_files','brand_assets']
  loop
    execute format('drop policy if exists %I on public.%I;', t||'_member', t);
    execute format('create policy %I on public.%I for all using (public.is_member()) with check (public.is_member());', t||'_member', t);
  end loop;
end $$;

-- STORAGE BUCKETS -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('finance', 'finance', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

-- Storage RLS: members can read/write objects in these buckets
do $$
declare
  bucket text;
  op text;
  pol text;
begin
  foreach bucket in array array['finance','brand-assets']
  loop
    foreach op in array array['select','insert','update','delete']
    loop
      pol := bucket || '_' || op;
      execute format('drop policy if exists %I on storage.objects;', pol);
      if op = 'insert' then
        execute format(
          'create policy %I on storage.objects for %s with check (bucket_id = %L and public.is_member());',
          pol, op, bucket
        );
      else
        execute format(
          'create policy %I on storage.objects for %s using (bucket_id = %L and public.is_member());',
          pol, op, bucket
        );
      end if;
    end loop;
  end loop;
end $$;

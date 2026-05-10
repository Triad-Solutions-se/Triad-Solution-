-- Per-project cold-call leads imported from spreadsheets.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fit_tier text,
  business_name text,
  industry text,
  neighborhood text,
  street_address text,
  phone text,
  website text,
  public_email text,
  status text not null default 'new', -- new | followup | meeting | nolead
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists leads_project_idx on public.leads (project_id);
create index if not exists leads_status_idx on public.leads (project_id, status);

-- Keep updated_at in sync.
create or replace function public.leads_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.leads_set_updated_at();

-- RLS: members only.
alter table public.leads enable row level security;
drop policy if exists leads_member on public.leads;
create policy leads_member on public.leads
  for all using (public.is_member()) with check (public.is_member());

-- Avtal ("Mallar → Avtal") — avtal byggda från offerter + uppladdade PUB-mallar.
-- Avtalsnummer: AVT-YYYY-NNN (auto). Två sub-features:
--   1. pub_templates — uppladdade .docx-mallar (med röda platshållare) i en
--      ny storage-bucket 'pub-templates'. extracted_blocks lagrar den parsade
--      struktur som PDF-rendern använder.
--   2. agreements — Avtal som kopplar en offert + PUB-mall + datum till en
--      ny entitet som kan listas, redigeras och laddas ner som PDF.

-- PUB-MALLAR ----------------------------------------------------------
create table if not exists public.pub_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  file_path text not null,                      -- inom 'pub-templates' bucket
  file_name text not null,
  file_size bigint,
  mime_type text,
  extracted_blocks jsonb,                       -- parsad block-struktur för rendering
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pub_templates_active_idx on public.pub_templates (is_active);
create index if not exists pub_templates_name_idx on public.pub_templates (name);

alter table public.pub_templates enable row level security;
drop policy if exists pub_templates_member on public.pub_templates;
create policy pub_templates_member on public.pub_templates
  for all using (public.is_member()) with check (public.is_member());

create or replace function public.pub_templates_touch() returns trigger
language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists pub_templates_before_update on public.pub_templates;
create trigger pub_templates_before_update
  before update on public.pub_templates
  for each row execute function public.pub_templates_touch();

-- AVTAL ---------------------------------------------------------------
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  agreement_number text unique,                 -- AVT-YYYY-NNN (auto)
  offer_id uuid references public.offers(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  pub_template_id uuid references public.pub_templates(id) on delete set null,
  status text not null default 'draft',         -- draft | signed | terminated
  agreement_date date not null default current_date,
  start_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agreements_offer_idx    on public.agreements (offer_id);
create index if not exists agreements_customer_idx on public.agreements (customer_id);
create index if not exists agreements_status_idx   on public.agreements (status);
create index if not exists agreements_date_idx     on public.agreements (agreement_date desc);

alter table public.agreements enable row level security;
drop policy if exists agreements_member on public.agreements;
create policy agreements_member on public.agreements
  for all using (public.is_member()) with check (public.is_member());

-- Auto-numrering: AVT-YYYY-NNN per kalenderår. Samma kollisionsstrategi som
-- offers — UNIQUE-constraint + retry i klienten vid race.
create or replace function public.next_agreement_number() returns text
language plpgsql as $$
declare
  yr int := extract(year from current_date)::int;
  cnt int;
begin
  select coalesce(max(
    (regexp_match(agreement_number, '^AVT-' || yr::text || '-(\d+)$'))[1]::int
  ), 0) + 1
    into cnt
    from public.agreements
   where agreement_number like ('AVT-' || yr::text || '-%');
  return 'AVT-' || yr::text || '-' || lpad(cnt::text, 3, '0');
end;
$$;

create or replace function public.agreements_set_defaults() returns trigger
language plpgsql as $$
begin
  if NEW.agreement_number is null or NEW.agreement_number = '' then
    NEW.agreement_number := public.next_agreement_number();
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists agreements_before_insert on public.agreements;
create trigger agreements_before_insert
  before insert on public.agreements
  for each row execute function public.agreements_set_defaults();

drop trigger if exists agreements_before_update on public.agreements;
create trigger agreements_before_update
  before update on public.agreements
  for each row execute function public.agreements_set_defaults();

-- STORAGE BUCKET för PUB-mallar --------------------------------------
insert into storage.buckets (id, name, public)
values ('pub-templates', 'pub-templates', false)
on conflict (id) do nothing;

do $$
declare
  op text;
  pol text;
begin
  foreach op in array array['select','insert','update','delete']
  loop
    pol := 'pub_templates_' || op;
    execute format('drop policy if exists %I on storage.objects;', pol);
    if op = 'insert' then
      execute format(
        'create policy %I on storage.objects for %s with check (bucket_id = %L and public.is_member());',
        pol, op, 'pub-templates'
      );
    else
      execute format(
        'create policy %I on storage.objects for %s using (bucket_id = %L and public.is_member());',
        pol, op, 'pub-templates'
      );
    end if;
  end loop;
end $$;

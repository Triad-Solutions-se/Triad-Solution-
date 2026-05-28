-- Leverantörens (Triad Solutions) företagsuppgifter som används i offert,
-- SaaS-avtal och PUB-avtal. Redigeras i portalen under Inställningar.
-- Singleton-tabell: alltid exakt en rad med id = 1.

create table if not exists public.company_settings (
  id          int primary key default 1,
  name        text not null default 'Triad Solutions',
  org_number  text,
  address     text,
  email       text,
  phone       text,
  dpo         text default 'Ej utsett',
  updated_at  timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)
);

alter table public.company_settings enable row level security;
drop policy if exists company_settings_member on public.company_settings;
create policy company_settings_member on public.company_settings
  for all using (public.is_member()) with check (public.is_member());

-- Säkerställ att singleton-raden finns.
insert into public.company_settings (id, name, email, dpo)
values (1, 'Triad Solutions', 'info@triadsolutions.se', 'Ej utsett')
on conflict (id) do nothing;

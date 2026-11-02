-- Fakturamejl: återkommande fakturering (0036) kan mejla sina fakturor
-- automatiskt, och varje faktura kan skickas med e-post från portalen.
--
-- - recurring_income.auto_send: fakturautkast som planen skapar mejlas med
--   PDF:en bifogad vid nästa dagliga körning (/api/cron/invoices, Vercel Cron)
--   och markeras då som skickade. email_to är mottagaren; last_error visar
--   senaste misslyckade utskick i planlistan. Av som standard, så befintliga
--   planer börjar inte mejla utan att någon slagit på det.
-- - invoices.email_to / emailed_at: vart och när fakturan senast mejlades.
-- - invoice_email_log: varje försök (lyckat eller inte), automatiskt eller
--   manuellt, så att det går att se vad som hänt med en faktura.
--
-- Bygger på 0034_invoice_system.sql och 0036_economy_links_recurring_billing.sql.
-- Hela filen är idempotent.

alter table public.recurring_income
  add column if not exists auto_send  boolean not null default false,
  add column if not exists email_to   text,
  add column if not exists last_error text;

alter table public.invoices
  add column if not exists email_to   text,
  add column if not exists emailed_at timestamptz;

create table if not exists public.invoice_email_log (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  to_email    text not null,
  status      text not null,                -- sent | failed
  provider_id text,                         -- id från e-posttjänsten
  error       text,
  automatic   boolean not null default false,
  sent_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint invoice_email_log_status_chk check (status in ('sent', 'failed'))
);

create index if not exists invoice_email_log_invoice_idx on public.invoice_email_log (invoice_id, created_at desc);

alter table public.invoice_email_log enable row level security;
drop policy if exists invoice_email_log_member on public.invoice_email_log;
create policy invoice_email_log_member on public.invoice_email_log
  for all using (public.is_member()) with check (public.is_member());

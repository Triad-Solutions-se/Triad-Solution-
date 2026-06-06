-- Supermind Fas 1: globala AI-reglage på singleton-tabellen company_settings.
--   ai_enabled         — nödstopp för alla autonoma körningar.
--   ai_daily_token_cap — spärr för dygnsförbrukning av tokens.

alter table public.company_settings
  add column if not exists ai_enabled         boolean not null default false,
  add column if not exists ai_daily_token_cap int     not null default 200000;

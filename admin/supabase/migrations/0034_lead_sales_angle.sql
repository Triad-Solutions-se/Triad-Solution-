-- Säljvinkel per lead: kort, företagsspecifik vinkel (nuläge, vinkel,
-- öppningsfras) som visas på lead-kortet under kalla samtal.

alter table public.leads
  add column if not exists sales_angle text;

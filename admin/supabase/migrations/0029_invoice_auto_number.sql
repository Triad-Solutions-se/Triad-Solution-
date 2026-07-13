-- Fakturor: auto-genererat fakturanummer (YYYY-NNN per kalenderår), samma
-- mönster som offerter (0015_offers.sql). Klienten föreslår nästa nummer i
-- formuläret; triggern är skyddsnät som fyller i number om det lämnas tomt.

create or replace function public.next_invoice_number() returns text
language plpgsql
set search_path = ''
as $$
declare
  yr int := extract(year from current_date)::int;
  cnt int;
begin
  select coalesce(max(
    (regexp_match(number, '^' || yr::text || '-(\d+)$'))[1]::int
  ), 0) + 1
    into cnt
    from public.invoices
   where number like (yr::text || '-%');
  return yr::text || '-' || lpad(cnt::text, 3, '0');
end;
$$;

create or replace function public.invoices_set_defaults() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.number is null or NEW.number = '' then
    NEW.number := public.next_invoice_number();
  end if;
  return NEW;
end;
$$;

drop trigger if exists invoices_before_insert on public.invoices;
create trigger invoices_before_insert
  before insert on public.invoices
  for each row execute function public.invoices_set_defaults();

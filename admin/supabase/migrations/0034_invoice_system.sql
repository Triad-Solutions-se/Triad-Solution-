-- Fakturasystem: kundfakturor med fakturarader, OCR-nummer och bankgiro,
-- kopplade till kund, offert och avtal. Bygger ut public.invoices (0001 +
-- 0014), som hittills varit ett enkelt fakturaregister under Ekonomi.
--
-- Nummer + OCR:
--   - Fakturanummer YYYY-NNN tilldelas av databasen vid insert — löpnummer
--     per kalenderår utifrån fakturadatumet. Ett advisory lock serialiserar
--     tilldelningen så att två samtidiga inserts aldrig får samma nummer.
--   - OCR-nummer = fakturanumrets siffror + längdsiffra + kontrollsiffra
--     (Luhn / modulus 10). Klarar Bankgirots OCR-kontroll både med och utan
--     längdkontroll. Genererad kolumn, så OCR alltid följer numret.
--   - Numret (och därmed OCR) låses när fakturan lämnat utkast-status, och
--     bara utkast kan raderas — skickade fakturor krediteras istället.
--
-- 0029_invoice_auto_number.sql har en enklare variant av numreringen. Den här
-- migrationen använder egna funktions- och triggernamn (och en trigger som
-- sorteras före 0029:s) så att det inte spelar någon roll i vilken ordning de
-- två körs. Hela filen är idempotent.

-- LEVERANTÖRENS FAKTURAUPPGIFTER --------------------------------------
alter table public.company_settings
  add column if not exists bankgiro           text,          -- t.ex. 123-4567
  add column if not exists vat_number         text,          -- momsreg.nr, SE556677889901
  add column if not exists registered_office  text,          -- styrelsens säte (ABL 28 kap. 1 §)
  add column if not exists f_skatt            boolean not null default true,
  add column if not exists payment_terms_days int not null default 30,
  add column if not exists late_interest      text;          -- valfri text om dröjsmålsränta

-- FAKTUROR ------------------------------------------------------------
alter table public.invoices
  add column if not exists offer_id            uuid references public.offers(id)     on delete set null,
  add column if not exists agreement_id        uuid references public.agreements(id) on delete set null,
  add column if not exists credited_invoice_id uuid references public.invoices(id)   on delete set null,
  -- Köparens uppgifter kopieras in från kundregistret när fakturan skapas, så
  -- att en utfärdad faktura inte ändras om kunden redigeras i efterhand.
  add column if not exists customer_org_number text,
  add column if not exists customer_address    text,
  add column if not exists reference           text,          -- Er referens
  add column if not exists our_reference       text,          -- Vår referens
  add column if not exists period_start        date,          -- leveransdatum / -period
  add column if not exists period_end          date,
  add column if not exists payment_terms_days  int not null default 30,
  -- Rader: [{ id, description, quantity, unit, unit_price, discount_pct }]
  -- unit_price är exkl. moms. Kreditfakturor har negativ quantity.
  add column if not exists items               jsonb not null default '[]'::jsonb,
  add column if not exists vat_rate            numeric(5,2) not null default 25.00,
  add column if not exists currency            text not null default 'SEK',
  add column if not exists net_amount          numeric(14,2) not null default 0,  -- exkl. moms
  add column if not exists vat_amount          numeric(14,2) not null default 0,
  add column if not exists message             text,          -- fakturatext som kunden ser
  add column if not exists sent_at             timestamptz,
  add column if not exists paid_at             date,
  add column if not exists created_by          uuid default auth.uid() references public.profiles(id) on delete set null,
  add column if not exists updated_at          timestamptz not null default now();

-- amount_sek (0001) = att betala inkl. moms efter öresavrundning.
comment on column public.invoices.amount_sek is 'Att betala inkl. moms (efter öresavrundning). Negativt för kreditfakturor.';

alter table public.invoices alter column issued_at set default current_date;
update public.invoices set status = 'draft' where status is null;
alter table public.invoices alter column status set not null;

alter table public.invoices drop constraint if exists invoices_status_chk;
alter table public.invoices
  add constraint invoices_status_chk
  check (status in ('draft', 'sent', 'paid', 'overdue', 'credited'));

alter table public.invoices drop constraint if exists invoices_payment_terms_chk;
alter table public.invoices
  add constraint invoices_payment_terms_chk
  check (payment_terms_days >= 0 and payment_terms_days <= 365);

-- OCR-NUMMER ----------------------------------------------------------
-- Ren funktion (immutable) så att den kan användas i en genererad kolumn.
-- Längdsiffran är OCR-numrets totala längd (inkl. längd- och kontrollsiffra)
-- modulo 10; kontrollsiffran räknas med Luhn över allt som står före den.
create or replace function public.invoice_ocr(p_number text) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  base text := regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g');
  payload text;
  total int := 0;
  d int;
  i int;
begin
  if base = '' then
    return null;
  end if;
  payload := base || ((length(base) + 2) % 10)::text;
  for i in 1..length(payload) loop
    d := substr(payload, length(payload) - i + 1, 1)::int;
    if i % 2 = 1 then
      d := d * 2;
      if d > 9 then
        d := d - 9;
      end if;
    end if;
    total := total + d;
  end loop;
  return payload || ((10 - total % 10) % 10)::text;
end;
$$;

alter table public.invoices
  add column if not exists ocr text generated always as (public.invoice_ocr(number)) stored;

-- FAKTURANUMMER -------------------------------------------------------
create or replace function public.invoice_next_number(p_date date) returns text
language plpgsql
set search_path = ''
as $$
declare
  yr text := extract(year from coalesce(p_date, current_date))::int::text;
  seq int;
begin
  -- Släpps automatiskt vid commit/rollback.
  perform pg_advisory_xact_lock(hashtext('public.invoices.number'));
  select coalesce(max((regexp_match(number, '^' || yr || '-(\d+)$'))[1]::int), 0) + 1
    into seq
    from public.invoices
   where number like yr || '-%';
  return yr || '-' || lpad(seq::text, 3, '0');
end;
$$;

create or replace function public.invoices_assign_defaults() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.number is null or btrim(NEW.number) = '' then
      NEW.number := public.invoice_next_number(NEW.issued_at);
    end if;
  elsif OLD.status <> 'draft' and NEW.number is distinct from OLD.number then
    raise exception 'Fakturanumret kan inte ändras på en skickad faktura (%).', OLD.number;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

create or replace function public.invoices_guard_delete() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.status <> 'draft' then
    raise exception 'Bara utkast kan raderas — kreditera faktura % istället.', OLD.number;
  end if;
  return OLD;
end;
$$;

-- 0029:s trigger behövs inte längre. Om 0029 skulle köras efter den här
-- migrationen återskapas den, men invoices_assign_defaults sorteras före
-- invoices_before_insert och hinner sätta numret först.
drop trigger if exists invoices_before_insert on public.invoices;

drop trigger if exists invoices_assign_defaults on public.invoices;
create trigger invoices_assign_defaults
  before insert or update on public.invoices
  for each row execute function public.invoices_assign_defaults();

drop trigger if exists invoices_guard_delete on public.invoices;
create trigger invoices_guard_delete
  before delete on public.invoices
  for each row execute function public.invoices_guard_delete();

-- INDEX ---------------------------------------------------------------
create unique index if not exists invoices_number_uidx on public.invoices (number);
create unique index if not exists invoices_ocr_uidx    on public.invoices (ocr);
create index if not exists invoices_customer_idx  on public.invoices (customer_id);
create index if not exists invoices_offer_idx     on public.invoices (offer_id);
create index if not exists invoices_agreement_idx on public.invoices (agreement_id);
create index if not exists invoices_credited_idx  on public.invoices (credited_invoice_id);
create index if not exists invoices_status_idx    on public.invoices (status);
create index if not exists invoices_issued_idx    on public.invoices (issued_at desc);

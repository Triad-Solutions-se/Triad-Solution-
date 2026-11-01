-- Ekonomin hänger ihop: offert → avtal → (återkommande) fakturor → intäkter.
--
-- 1. Betalda fakturor bokförs som intäkter. En trigger på invoices håller en
--    income-rad (income.invoice_id) i synk med fakturan: raden finns så länge
--    fakturan är betald och följer belopp, betaldatum, kund, projekt och
--    bankkonto. Ångrad betalning, återställt utkast eller kreditering tar bort
--    raden igen. Kassa, Intäkter och Cashflow på Ekonomi-sidan räknar därmed
--    in fakturabetalningar utan att någon behöver registrera dem två gånger.
--    Beloppet är det fakturan säger "att betala" (inkl. moms), dvs. det som
--    faktiskt kommer in på kontot — samma kassaprincip som resten av sidan.
--
-- 2. Återkommande fakturering. recurring_income (0030) får ett läge
--    (create_invoices) där varje period blir ett fakturautkast i stället för
--    en income-rad: koppling till avtal/offert, fakturarader per period, moms,
--    betalningsvillkor och fakturering i förskott (lead_days före perioden)
--    eller efterskott (dagen efter perioden). next_due_date är markören —
--    starten på nästa period som ska faktureras — så ett raderat utkast
--    skapas inte igen. invoices.recurring_income_id + unikt index
--    (recurring_income_id, period_start) gör genereringen idempotent även om
--    två sidladdningar kör samtidigt. Frekvensen utökas med halvår.
--
-- 3. Offerten anger hur den återkommande kostnaden faktureras
--    (billing_interval). Det syns i offert-/avtals-PDF:en och blir förval när
--    avtalets återkommande fakturering läggs upp.
--
-- Hela filen är idempotent.

-- 1. FAKTURA → INTÄKT -------------------------------------------------
alter table public.income
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;

-- NULL räknas som distinkt, så manuellt skapade intäkter påverkas inte.
create unique index if not exists income_invoice_uidx on public.income (invoice_id);

create or replace function public.invoices_sync_income() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.status = 'paid' and NEW.credited_invoice_id is null then
    insert into public.income
      (description, amount_sek, source, date, status, customer_id, project_id, bank_account_id, invoice_id)
    values (
      'Faktura ' || NEW.number || coalesce(' · ' || nullif(btrim(NEW.customer_name), ''), ''),
      NEW.amount_sek,
      'customer',
      coalesce(NEW.paid_at, current_date),
      'received',
      NEW.customer_id,
      NEW.project_id,
      NEW.bank_account_id,
      NEW.id
    )
    on conflict (invoice_id) do update set
      description     = excluded.description,
      amount_sek      = excluded.amount_sek,
      date            = excluded.date,
      status          = 'received',
      customer_id     = excluded.customer_id,
      -- Ett bankkonto/projekt som satts direkt på intäkten behålls om fakturan saknar det.
      project_id      = coalesce(excluded.project_id, public.income.project_id),
      bank_account_id = coalesce(excluded.bank_account_id, public.income.bank_account_id);
  elsif TG_OP = 'UPDATE' then
    delete from public.income where invoice_id = NEW.id;
  end if;
  return null;
end;
$$;

drop trigger if exists invoices_sync_income on public.invoices;
create trigger invoices_sync_income
  after insert or update of status, paid_at, amount_sek, number, customer_id, customer_name,
    project_id, bank_account_id, credited_invoice_id
  on public.invoices
  for each row execute function public.invoices_sync_income();

-- Redan betalda fakturor. Hoppa över dem som ser ut att redan ha registrerats
-- för hand (en okopplad intäkt från samma kund med samma belopp).
insert into public.income
  (description, amount_sek, source, date, status, customer_id, project_id, bank_account_id, invoice_id)
select
  'Faktura ' || i.number || coalesce(' · ' || nullif(btrim(i.customer_name), ''), ''),
  i.amount_sek,
  'customer',
  coalesce(i.paid_at, i.issued_at, current_date),
  'received',
  i.customer_id,
  i.project_id,
  i.bank_account_id,
  i.id
from public.invoices i
where i.status = 'paid'
  and i.credited_invoice_id is null
  and not exists (
    select 1 from public.income x
     where x.invoice_id is null
       and x.customer_id = i.customer_id
       and x.amount_sek = i.amount_sek
  )
on conflict (invoice_id) do nothing;

-- 2. ÅTERKOMMANDE FAKTURERING ----------------------------------------
alter table public.recurring_income
  add column if not exists agreement_id       uuid references public.agreements(id) on delete set null,
  add column if not exists offer_id           uuid references public.offers(id)     on delete set null,
  add column if not exists create_invoices    boolean not null default false,
  -- Rader på varje faktura: [{ id, description, quantity, unit, unit_price, discount_pct }]
  -- (samma format som invoices.items, unit_price exkl. moms).
  add column if not exists items              jsonb not null default '[]'::jsonb,
  add column if not exists vat_rate           numeric(5,2) not null default 25.00,
  add column if not exists currency           text not null default 'SEK',
  add column if not exists payment_terms_days int,                 -- null = Inställningar
  add column if not exists billing_timing     text not null default 'advance',  -- advance | arrears
  add column if not exists lead_days          int not null default 14,
  add column if not exists invoice_message    text,
  add column if not exists our_reference      text;

comment on column public.recurring_income.amount_sek is
  'Belopp per period. För create_invoices = att betala per faktura inkl. moms.';
comment on column public.recurring_income.next_due_date is
  'Nästa förfallodatum. För create_invoices = start på nästa period som ska faktureras (markör).';

alter table public.recurring_income drop constraint if exists recurring_income_frequency_chk;
alter table public.recurring_income
  add constraint recurring_income_frequency_chk
  check (frequency in ('monthly', 'quarterly', 'semiannual', 'yearly'));

alter table public.recurring_income drop constraint if exists recurring_income_billing_chk;
alter table public.recurring_income
  add constraint recurring_income_billing_chk
  check (
    billing_timing in ('advance', 'arrears')
    and lead_days between 0 and 90
    and (payment_terms_days is null or payment_terms_days between 0 and 365)
  );

create index if not exists recurring_income_agreement_idx on public.recurring_income (agreement_id);
create index if not exists recurring_income_offer_idx     on public.recurring_income (offer_id);

alter table public.invoices
  add column if not exists recurring_income_id uuid references public.recurring_income(id) on delete set null;

create unique index if not exists invoices_recurring_period_uidx
  on public.invoices (recurring_income_id, period_start);

-- 3. OFFERTENS FAKTURERINGSINTERVALL ---------------------------------
alter table public.offers
  add column if not exists billing_interval text not null default 'monthly';

alter table public.offers drop constraint if exists offers_billing_interval_chk;
alter table public.offers
  add constraint offers_billing_interval_chk
  check (billing_interval in ('monthly', 'quarterly', 'semiannual', 'yearly'));

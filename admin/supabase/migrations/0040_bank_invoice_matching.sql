-- Bankavstämning: inbetalningar från banken (bank_transactions, 0039) kopplas
-- till obetalda kundfakturor (invoices, 0034) så att fakturan markeras som
-- betald utan att någon bockar av den för hand.
--
-- bank_invoice_matches: en rad per par (transaktion, faktura).
--   status 'applied'  = transaktionen betalade fakturan. Högst en per
--                       transaktion och en per faktura (partiella unika index),
--                       så inget kan matchas två gånger.
--   status 'rejected' = paret är ångrat eller avfärdat. Raden ligger kvar så
--                       att nästa synk inte kopplar samma par automatiskt igen.
--   method  'auto' (synken kopplade) eller 'manual' (någon klickade).
--   rule    vilken regel som hittade paret: 'ocr' / 'number' (stark: OCR eller
--           fakturanummer i bankens referens/text + exakt belopp), 'name'
--           (svag: samma belopp + liknande namn) eller 'manual'.
--   prev_bank_account_id: fakturans bankkonto före kopplingen, återställs vid ångra.
--
-- bank_match_apply / bank_match_undo / bank_match_dismiss gör ändringen i en
-- transaktion (kopplingen + fakturans status), och kontrollerar att
-- transaktionen är bokförd och inbetald, att fakturan är obetald och att
-- beloppet stämmer exakt. Bara servern (service role) får anropa dem — samma
-- modell som banktabellerna: medlemmar läser, servern skriver.
--
-- Ångrar man betalningen på fakturan ("Ångra betalning" i fakturaeditorn)
-- markeras kopplingen som avvisad av en trigger, så att transaktionen blir
-- fri igen och synken inte kopplar tillbaka den.
--
-- Fakturans status 'paid' sätts på samma sätt som i fakturaeditorn (status,
-- paid_at, bank_account_id), så 0036:s trigger bokför intäkten som vanligt.
-- Hela filen är idempotent.

create table if not exists public.bank_invoice_matches (
  id                   uuid primary key default gen_random_uuid(),
  bank_transaction_id  uuid not null references public.bank_transactions(id) on delete cascade,
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  status               text not null default 'applied',
  method               text not null,
  rule                 text not null,
  amount               numeric(14,2) not null,
  prev_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  undone_by            uuid references public.profiles(id) on delete set null,
  undone_at            timestamptz,
  unique (bank_transaction_id, invoice_id),
  constraint bank_invoice_matches_status_chk check (status in ('applied', 'rejected')),
  constraint bank_invoice_matches_method_chk check (method in ('auto', 'manual')),
  constraint bank_invoice_matches_rule_chk   check (rule in ('ocr', 'number', 'name', 'manual'))
);

create unique index if not exists bank_invoice_matches_tx_applied_uidx
  on public.bank_invoice_matches (bank_transaction_id) where status = 'applied';
create unique index if not exists bank_invoice_matches_invoice_applied_uidx
  on public.bank_invoice_matches (invoice_id) where status = 'applied';
create index if not exists bank_invoice_matches_invoice_idx
  on public.bank_invoice_matches (invoice_id);

alter table public.bank_invoice_matches enable row level security;
drop policy if exists bank_invoice_matches_select on public.bank_invoice_matches;
create policy bank_invoice_matches_select on public.bank_invoice_matches
  for select using (public.is_member());

-- KOPPLA ---------------------------------------------------------------
create or replace function public.bank_match_apply(
  p_transaction uuid,
  p_invoice     uuid,
  p_method      text,
  p_rule        text,
  p_user        uuid default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  tx  public.bank_transactions%rowtype;
  inv public.invoices%rowtype;
  match_id uuid;
begin
  select * into tx from public.bank_transactions where id = p_transaction for update;
  if not found then
    raise exception 'Banktransaktionen finns inte.';
  end if;
  if tx.status <> 'BOOK' then
    raise exception 'Transaktionen är inte bokförd än — vänta tills banken bokfört den.';
  end if;
  if tx.amount <= 0 then
    raise exception 'Bara inbetalningar kan kopplas till fakturor.';
  end if;

  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if inv.credited_invoice_id is not null or inv.status not in ('sent', 'overdue') then
    raise exception 'Faktura % är inte obetald.', inv.number;
  end if;
  if inv.amount_sek <> tx.amount or coalesce(inv.currency, 'SEK') <> coalesce(tx.currency, 'SEK') then
    raise exception 'Beloppet stämmer inte: faktura % är på % %, inbetalningen % %.',
      inv.number, inv.amount_sek, coalesce(inv.currency, 'SEK'), tx.amount, coalesce(tx.currency, 'SEK');
  end if;
  if exists (
    select 1 from public.bank_invoice_matches
     where status = 'applied' and (bank_transaction_id = tx.id or invoice_id = inv.id)
  ) then
    raise exception 'Transaktionen eller fakturan är redan kopplad.';
  end if;

  insert into public.bank_invoice_matches as m
    (bank_transaction_id, invoice_id, status, method, rule, amount, prev_bank_account_id, created_by)
  values
    (tx.id, inv.id, 'applied', p_method, p_rule, tx.amount, inv.bank_account_id, p_user)
  on conflict (bank_transaction_id, invoice_id) do update set
    status               = 'applied',
    method               = excluded.method,
    rule                 = excluded.rule,
    amount               = excluded.amount,
    prev_bank_account_id = excluded.prev_bank_account_id,
    created_by           = excluded.created_by,
    created_at           = now(),
    undone_by            = null,
    undone_at            = null
  returning m.id into match_id;

  update public.invoices
     set status          = 'paid',
         paid_at         = coalesce(tx.booking_date, tx.value_date, current_date),
         bank_account_id = tx.bank_account_id
   where id = inv.id;

  return match_id;
end;
$$;

-- ÅNGRA ----------------------------------------------------------------
-- Fakturan blir obetald igen ('sent'; "Förfallen" räknas fram av appen) och
-- paret sparas som avvisat så att synken inte kopplar det automatiskt igen.
create or replace function public.bank_match_undo(p_match uuid, p_user uuid default null) returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.bank_invoice_matches%rowtype;
begin
  select * into m from public.bank_invoice_matches where id = p_match for update;
  if not found or m.status <> 'applied' then
    raise exception 'Kopplingen finns inte eller är redan ångrad.';
  end if;

  update public.bank_invoice_matches
     set status = 'rejected', undone_by = p_user, undone_at = now()
   where id = m.id;

  update public.invoices
     set status          = 'sent',
         paid_at         = null,
         bank_account_id = m.prev_bank_account_id
   where id = m.invoice_id
     and status = 'paid';
end;
$$;

-- AVFÄRDA FÖRSLAG -------------------------------------------------------
create or replace function public.bank_match_dismiss(
  p_transaction uuid,
  p_invoice     uuid,
  p_user        uuid default null
) returns void
language plpgsql
set search_path = ''
as $$
declare
  amt numeric(14,2);
begin
  select amount into amt from public.bank_transactions where id = p_transaction;
  if not found then
    raise exception 'Banktransaktionen finns inte.';
  end if;
  insert into public.bank_invoice_matches
    (bank_transaction_id, invoice_id, status, method, rule, amount, created_by, undone_by, undone_at)
  values
    (p_transaction, p_invoice, 'rejected', 'manual', 'manual', amt, p_user, p_user, now())
  on conflict (bank_transaction_id, invoice_id) do nothing;
end;
$$;

revoke execute on function public.bank_match_apply(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.bank_match_undo(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.bank_match_dismiss(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bank_match_apply(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.bank_match_undo(uuid, uuid) to service_role;
grant execute on function public.bank_match_dismiss(uuid, uuid, uuid) to service_role;

-- BETALNING ÅNGRAD PÅ FAKTURAN -------------------------------------------
-- Fakturaeditorn uppdaterar invoices som inloggad medlem, som inte får skriva
-- i bank_invoice_matches — därför security definer.
create or replace function public.invoices_release_bank_match() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if OLD.status = 'paid' and NEW.status in ('draft', 'sent', 'overdue') then
    update public.bank_invoice_matches
       set status = 'rejected', undone_by = auth.uid(), undone_at = now()
     where invoice_id = NEW.id
       and status = 'applied';
  end if;
  return null;
end;
$$;

revoke execute on function public.invoices_release_bank_match() from public, anon, authenticated;

drop trigger if exists invoices_release_bank_match on public.invoices;
create trigger invoices_release_bank_match
  after update of status on public.invoices
  for each row execute function public.invoices_release_bank_match();

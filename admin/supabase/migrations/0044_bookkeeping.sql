-- Bokföring: dubbel bokföring enligt BAS 2026 med en kö "Att godkänna".
--
-- Förslagen i kön räknas fram i appen ur fakturor, banktransaktioner,
-- betalningar och utlägg (src/lib/accounting/proposals.ts) och sparas inte. Det
-- som sparas är besluten: en godkänd post blir en verifikation, en överhoppad
-- post noteras i accounting_decisions.
--
-- Bokföringslagens krav som databasen själv håller:
--   - Verifikationsnummer är löpande utan luckor per räkenskapsår. Numret sätts
--     vid bokföring under ett advisory lock, och verifikationer raderas aldrig.
--   - Verifikationer och rader kan inte ändras eller raderas (triggers, gäller
--     även service role). Fel rättas med en rättelseverifikation.
--   - Debet = kredit i varje verifikation (uppskjuten constraint trigger).
--   - Låst period: inget får bokföras på eller före locked_through.
--   - accounting_log är behandlingshistoriken: vem gjorde vad och när.
--
-- Moms: ruta i momsdeklarationen kommer från kontot (accounting_accounts.vat_box)
-- eller från raden (journal_lines.vat_box). Radmärkningen behövs för omvänd
-- skattskyldighet: BAS 2026 saknar motkonto för 4531/4535, så köp av utländska
-- tjänster bokförs på rätt kostnadskonto (t.ex. 6540) med ruta 21 eller 22 på raden.
--
-- Medlemmar läser, servern (service role) skriver via API-routerna, samma modell
-- som banktabellerna. Hela filen är idempotent.

-- KONTOPLAN --------------------------------------------------------------
create table if not exists public.accounting_accounts (
  number     int primary key check (number between 1000 and 8999),
  name       text not null,
  vat_box    text,                          -- ruta i momsdeklarationen
  common     boolean not null default false, -- visas först i kontolistan
  active     boolean not null default true,
  custom     boolean not null default false, -- tillagt i portalen, inte från fröet
  created_at timestamptz not null default now()
);

-- INSTÄLLNINGAR (en rad) ---------------------------------------------------
create table if not exists public.accounting_settings (
  id                      int primary key default 1 check (id = 1),
  start_date              date not null,     -- underlag före detta datum föreslås inte
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  vat_period              text not null default 'quarterly'
                          check (vat_period in ('monthly', 'quarterly', 'yearly')),
  locked_through          date,              -- sista låsta dagen
  updated_at              timestamptz not null default now()
);

-- Bokföringen börjar vid bankhistorikens första dag (annars i dag).
insert into public.accounting_settings (id, start_date)
select 1, coalesce((select min(booking_date) from public.bank_transactions where status = 'BOOK'), current_date)
on conflict (id) do nothing;

-- RÄKENSKAPSÅR -------------------------------------------------------------
create table if not exists public.accounting_fiscal_years (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null,
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  constraint accounting_fiscal_years_order_chk check (end_date > start_date),
  constraint accounting_fiscal_years_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

insert into public.accounting_fiscal_years (start_date, end_date)
select make_date(extract(year from s.start_date)::int, 1, 1),
       make_date(extract(year from s.start_date)::int, 12, 31)
  from public.accounting_settings s
 where not exists (select 1 from public.accounting_fiscal_years);

-- VERIFIKATIONER -----------------------------------------------------------
-- created_by saknar främmande nyckel med flit: historiken ska finnas kvar om en
-- användare tas bort, och raderna får inte ändras.
create table if not exists public.journal_entries (
  id                uuid primary key default gen_random_uuid(),
  fiscal_year_id    uuid not null references public.accounting_fiscal_years(id),
  series            text not null default 'A',
  number            int not null,
  date              date not null,
  description       text not null,
  source_key        text,                    -- underlaget, t.ex. bank:<id> eller invoice:<id>
  link_key          text,                    -- det underlaget betalar, t.ex. expense:<id>
  reverses_entry_id uuid references public.journal_entries(id),
  attachment_path   text,                    -- fil i finance-bucketen (manuella verifikationer)
  created_by        uuid,
  created_at        timestamptz not null default now(),
  unique (fiscal_year_id, series, number)
);

create unique index if not exists journal_entries_reverses_uidx
  on public.journal_entries (reverses_entry_id) where reverses_entry_id is not null;
create index if not exists journal_entries_date_idx on public.journal_entries (date);
create index if not exists journal_entries_source_idx on public.journal_entries (source_key);

create table if not exists public.journal_lines (
  id       uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id),
  line_no  int not null,
  account  int not null references public.accounting_accounts(number),
  debit    numeric(14,2) not null default 0 check (debit >= 0),
  credit   numeric(14,2) not null default 0 check (credit >= 0),
  vat_box  text,
  note     text,
  constraint journal_lines_one_side_chk check ((debit = 0) <> (credit = 0)),
  unique (entry_id, line_no)
);

create index if not exists journal_lines_account_idx on public.journal_lines (account);

-- BESLUT -------------------------------------------------------------------
-- Vilka underlag som är hanterade. En rättelse tar bort raden, så att underlaget
-- kommer tillbaka i kön. Unikt link_key: en utgift betalas av en banktransaktion.
create table if not exists public.accounting_decisions (
  source_key text primary key,
  decision   text not null check (decision in ('booked', 'ignored')),
  entry_id   uuid references public.journal_entries(id),
  link_key   text,
  note       text,
  decided_by uuid,
  decided_at timestamptz not null default now()
);

create unique index if not exists accounting_decisions_link_uidx
  on public.accounting_decisions (link_key) where link_key is not null;

-- KONTERINGSREGLER ---------------------------------------------------------
-- Text från banken/underlaget → konto + moms. 'seed' levereras här, 'learned'
-- skapas när någon väljer ett annat konto och godkänner.
create table if not exists public.accounting_rules (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null unique,
  direction  text not null default 'out' check (direction in ('in', 'out', 'any')),
  account    int not null references public.accounting_accounts(number),
  vat_code   text not null default 'se25'
             check (vat_code in ('se25', 'se12', 'se6', 'none', 'eu_rc', 'noneu_rc')),
  origin     text not null default 'seed' check (origin in ('seed', 'learned')),
  updated_at timestamptz not null default now()
);

-- BEHANDLINGSHISTORIK ------------------------------------------------------
create table if not exists public.accounting_log (
  id         bigint generated always as identity primary key,
  action     text not null,
  entry_id   uuid,
  source_key text,
  detail     jsonb,
  actor      uuid,
  at         timestamptz not null default now()
);

create index if not exists accounting_log_at_idx on public.accounting_log (at desc);

-- BANKKONTO → BOKFÖRINGSKONTO ---------------------------------------------
alter table public.bank_accounts
  add column if not exists ledger_account int;

-- BEHÖRIGHETER -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounting_accounts', 'accounting_settings', 'accounting_fiscal_years',
    'journal_entries', 'journal_lines', 'accounting_decisions', 'accounting_rules', 'accounting_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_member())', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- BOKFÖRDA POSTER ÄR OÄNDRINGSBARA ----------------------------------------
create or replace function public.journal_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Bokförda verifikationer kan inte ändras eller raderas. Gör en rättelse i stället.';
end;
$$;

drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.journal_immutable();

drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function public.journal_immutable();

drop trigger if exists journal_entries_no_truncate on public.journal_entries;
create trigger journal_entries_no_truncate
  before truncate on public.journal_entries
  for each statement execute function public.journal_immutable();

drop trigger if exists journal_lines_no_truncate on public.journal_lines;
create trigger journal_lines_no_truncate
  before truncate on public.journal_lines
  for each statement execute function public.journal_immutable();

-- DEBET = KREDIT -----------------------------------------------------------
-- Kontrolleras vid commit så att raderna hinner läggas in en i taget.
create or replace function public.journal_check_balance() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Triggern sitter på båda tabellerna: raderna har entry_id, verifikationen id.
  eid uuid := coalesce(to_jsonb(NEW)->>'entry_id', to_jsonb(NEW)->>'id')::uuid;
  total_debit numeric;
  total_credit numeric;
  line_count int;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into total_debit, total_credit, line_count
    from public.journal_lines
   where entry_id = eid;
  if line_count < 2 then
    raise exception 'En verifikation måste ha minst två rader.';
  end if;
  if total_debit <> total_credit then
    raise exception 'Verifikationen balanserar inte: debet % och kredit %.', total_debit, total_credit;
  end if;
  return null;
end;
$$;

drop trigger if exists journal_lines_balanced on public.journal_lines;
create constraint trigger journal_lines_balanced
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.journal_check_balance();

drop trigger if exists journal_entries_balanced on public.journal_entries;
create constraint trigger journal_entries_balanced
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function public.journal_check_balance();

-- RÄKENSKAPSÅR FÖR ETT DATUM ----------------------------------------------
-- Finns inget år skapas det utifrån inställningens startmånad.
create or replace function public.accounting_fiscal_year_for(p_date date) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  fy_id uuid;
  closed timestamptz;
  start_month int;
  fy_start date;
begin
  select id, closed_at into fy_id, closed
    from public.accounting_fiscal_years
   where p_date between start_date and end_date;
  if found then
    if closed is not null then
      raise exception 'Räkenskapsåret för % är stängt.', p_date;
    end if;
    return fy_id;
  end if;

  select fiscal_year_start_month into start_month from public.accounting_settings where id = 1;
  fy_start := make_date(extract(year from p_date)::int, start_month, 1);
  if fy_start > p_date then
    fy_start := (fy_start - interval '1 year')::date;
  end if;
  begin
    insert into public.accounting_fiscal_years (start_date, end_date)
    values (fy_start, (fy_start + interval '1 year' - interval '1 day')::date)
    returning id into fy_id;
  exception when exclusion_violation then
    raise exception 'Datumet % ligger inte i något räkenskapsår. Lägg till året under Inställningar.', p_date;
  end;
  return fy_id;
end;
$$;

-- BOKFÖR -------------------------------------------------------------------
-- p_lines: [{ account, debit, credit, vat_box?, note? }]
-- p_lock_through: låser perioden i samma transaktion (momsavslut).
create or replace function public.accounting_post_entry(
  p_date         date,
  p_description  text,
  p_lines        jsonb,
  p_source_key   text default null,
  p_link_key     text default null,
  p_attachment   text default null,
  p_reverses     uuid default null,
  p_lock_through date default null,
  p_user         uuid default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  locked date;
  fy_id uuid;
  eid uuid;
  next_no int;
  line jsonb;
  idx int := 0;
  acc int;
  d numeric;
  c numeric;
begin
  if p_date is null then
    raise exception 'Datum saknas.';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Text saknas.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'En verifikation måste ha minst två rader.';
  end if;

  -- Släpps vid commit/rollback. Serialiserar numren så att de blir utan luckor.
  perform pg_advisory_xact_lock(hashtext('public.journal_entries.number'));

  select locked_through into locked from public.accounting_settings where id = 1;
  if locked is not null and p_date <= locked then
    raise exception 'Perioden är låst till och med %. Välj ett senare datum.', locked;
  end if;

  fy_id := public.accounting_fiscal_year_for(p_date);

  select coalesce(max(number), 0) + 1 into next_no
    from public.journal_entries
   where fiscal_year_id = fy_id and series = 'A';

  insert into public.journal_entries
    (fiscal_year_id, number, date, description, source_key, link_key, reverses_entry_id, attachment_path, created_by)
  values
    (fy_id, next_no, p_date, btrim(p_description), p_source_key, p_link_key, p_reverses, p_attachment, p_user)
  returning id into eid;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    idx := idx + 1;
    acc := (line->>'account')::int;
    d := coalesce((line->>'debit')::numeric, 0);
    c := coalesce((line->>'credit')::numeric, 0);
    if not exists (select 1 from public.accounting_accounts where number = acc and active) then
      raise exception 'Konto % finns inte i kontoplanen.', acc;
    end if;
    if d <> round(d, 2) or c <> round(c, 2) then
      raise exception 'Belopp får ha högst två decimaler (rad %).', idx;
    end if;
    if d < 0 or c < 0 or (d = 0) = (c = 0) then
      raise exception 'Rad % måste ha ett belopp i antingen debet eller kredit.', idx;
    end if;
    insert into public.journal_lines (entry_id, line_no, account, debit, credit, vat_box, note)
    values (eid, idx, acc, d, c, nullif(line->>'vat_box', ''), nullif(line->>'note', ''));
  end loop;

  if p_source_key is not null then
    begin
      insert into public.accounting_decisions (source_key, decision, entry_id, link_key, decided_by)
      values (p_source_key, 'booked', eid, p_link_key, p_user);
    exception when unique_violation then
      raise exception 'Underlaget är redan bokfört eller kopplat till en annan verifikation.';
    end;
  end if;

  if p_lock_through is not null then
    update public.accounting_settings
       set locked_through = greatest(locked_through, p_lock_through), updated_at = now()
     where id = 1;
  end if;

  insert into public.accounting_log (action, entry_id, source_key, detail, actor)
  values (
    case when p_reverses is null then 'post' else 'reverse' end,
    eid, p_source_key,
    jsonb_build_object('number', next_no, 'date', p_date, 'reverses', p_reverses, 'locked_through', p_lock_through),
    p_user
  );

  return jsonb_build_object('id', eid, 'number', next_no, 'series', 'A');
end;
$$;

-- RÄTTELSE -----------------------------------------------------------------
-- Ny verifikation med omvända rader. Underlaget släpps och kommer tillbaka i kön.
create or replace function public.accounting_reverse_entry(
  p_entry uuid,
  p_date  date,
  p_user  uuid default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  e public.journal_entries%rowtype;
  swapped jsonb;
  result jsonb;
begin
  select * into e from public.journal_entries where id = p_entry;
  if not found then
    raise exception 'Verifikationen finns inte.';
  end if;
  if e.reverses_entry_id is not null then
    raise exception 'En rättelse kan inte rättas. Bokför en ny verifikation i stället.';
  end if;
  if exists (select 1 from public.journal_entries where reverses_entry_id = e.id) then
    raise exception 'Verifikationen är redan rättad.';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'account', account, 'debit', credit, 'credit', debit,
             'vat_box', vat_box, 'note', note
           ) order by line_no
         )
    into swapped
    from public.journal_lines
   where entry_id = e.id;

  result := public.accounting_post_entry(
    p_date,
    'Rättelse av ' || e.series || e.number || ': ' || e.description,
    swapped,
    null, null, null, e.id, null, p_user
  );

  delete from public.accounting_decisions where entry_id = e.id;
  return result;
end;
$$;

-- HOPPA ÖVER / ÅTERSTÄLL ---------------------------------------------------
create or replace function public.accounting_ignore(
  p_key  text,
  p_note text default null,
  p_user uuid default null
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.accounting_decisions (source_key, decision, note, decided_by)
  values (p_key, 'ignored', p_note, p_user);
  insert into public.accounting_log (action, source_key, detail, actor)
  values ('ignore', p_key, jsonb_build_object('note', p_note), p_user);
exception when unique_violation then
  raise exception 'Posten är redan hanterad.';
end;
$$;

create or replace function public.accounting_unignore(p_key text, p_user uuid default null) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.accounting_decisions where source_key = p_key and decision = 'ignored';
  if not found then
    raise exception 'Posten är inte överhoppad.';
  end if;
  insert into public.accounting_log (action, source_key, actor) values ('unignore', p_key, p_user);
end;
$$;

revoke execute on function public.accounting_fiscal_year_for(date) from public, anon, authenticated;
revoke execute on function public.accounting_post_entry(date, text, jsonb, text, text, text, uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.accounting_reverse_entry(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.accounting_ignore(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.accounting_unignore(text, uuid) from public, anon, authenticated;
grant execute on function public.accounting_fiscal_year_for(date) to service_role;
grant execute on function public.accounting_post_entry(date, text, jsonb, text, text, text, uuid, date, uuid) to service_role;
grant execute on function public.accounting_reverse_entry(uuid, date, uuid) to service_role;
grant execute on function public.accounting_ignore(text, text, uuid) to service_role;
grant execute on function public.accounting_unignore(text, uuid) to service_role;

-- KONTOPLAN: BAS 2026, urval för ett mindre tjänsteföretag. Inga #-konton (de
-- får inte användas i K2). Fler konton läggs till under Inställningar.
insert into public.accounting_accounts (number, name, vat_box, common) values
  (1220, 'Inventarier, verktyg och installationer', null, false),
  (1224, 'Datorer (ej för produktion)', null, true),
  (1229, 'Ackumulerade avskrivningar på inventarier, verktyg och installationer', null, false),
  (1510, 'Kundfordringar', null, true),
  (1516, 'Tvistiga kundfordringar', null, false),
  (1519, 'Nedskrivning av kundfordringar', null, false),
  (1610, 'Kortfristiga fordringar hos anställda', null, false),
  (1630, 'Avräkning för skatter och avgifter (skattekonto)', null, true),
  (1650, 'Momsfordran', null, false),
  (1680, 'Andra kortfristiga fordringar', null, false),
  (1710, 'Förutbetalda hyreskostnader', null, false),
  (1790, 'Övriga förutbetalda kostnader och upplupna intäkter', null, false),
  (1910, 'Kassa', null, false),
  (1920, 'PlusGiro', null, false),
  (1930, 'Företagskonto', null, true),
  (1940, 'Övriga bankkonton', null, false),
  (2081, 'Aktiekapital', null, true),
  (2091, 'Balanserad vinst eller förlust', null, false),
  (2093, 'Erhållna aktieägartillskott', null, true),
  (2097, 'Fri överkursfond', null, false),
  (2098, 'Vinst eller förlust från föregående år', null, false),
  (2099, 'Årets resultat', null, false),
  (2393, 'Lån från närstående personer, långfristig del', null, false),
  (2440, 'Leverantörsskulder', null, true),
  (2510, 'Skatteskulder', null, false),
  (2611, 'Utgående moms på försäljning inom Sverige, 25 %', '10', true),
  (2614, 'Utgående moms omvänd betalskyldighet, 25 %', '30', true),
  (2615, 'Utgående moms import av varor, 25 %', '60', false),
  (2621, 'Utgående moms på försäljning inom Sverige, 12 %', '11', false),
  (2624, 'Utgående moms omvänd betalningsskyldighet 12 %', '31', false),
  (2631, 'Utgående moms på försäljning inom Sverige, 6 %', '12', false),
  (2634, 'Utgående moms omvänd betalningsskyldighet, 6 %', '32', false),
  (2641, 'Debiterad ingående moms', '48', true),
  (2645, 'Beräknad ingående moms på förvärv från utlandet', '48', true),
  (2650, 'Redovisningskonto för moms', null, true),
  (2710, 'Personalskatt', null, false),
  (2730, 'Lagstadgade sociala avgifter och särskild löneskatt', null, false),
  (2820, 'Kortfristiga skulder till anställda', null, false),
  (2890, 'Övriga kortfristiga skulder', null, false),
  (2893, 'Skulder till närstående personer, kortfristig del', null, true),
  (2920, 'Upplupna semesterlöner', null, false),
  (2940, 'Upplupna lagstadgade sociala och andra avgifter', null, false),
  (2990, 'Övriga upplupna kostnader och förutbetalda intäkter', null, false),
  (2999, 'OBS-konto', null, true),
  (3001, 'Försäljning inom Sverige, 25 % moms', '05', true),
  (3002, 'Försäljning inom Sverige, 12 % moms', '05', false),
  (3003, 'Försäljning inom Sverige, 6 % moms', '05', false),
  (3004, 'Försäljning inom Sverige, momsfri', '42', false),
  (3105, 'Försäljning varor till land utanför EU', '36', false),
  (3106, 'Försäljning varor till annat EU-land, momspliktig', '05', false),
  (3108, 'Försäljning varor till annat EU-land, momsfri', '35', false),
  (3305, 'Försäljning tjänster till land utanför EU', '40', true),
  (3308, 'Försäljning tjänster till annat EU-land', '39', true),
  (3740, 'Öres- och kronutjämning', null, false),
  (3960, 'Valutakursvinster på fordringar och skulder av rörelsekaraktär', null, false),
  (3990, 'Övriga ersättningar, bidrag och intäkter', null, false),
  (4010, 'Inköp av handelsvaror i Sverige', null, false),
  (4515, 'Inköp av råvaror och material från annat EU-land, 25 %', '20', false),
  (4531, 'Inköp av tjänster från ett land utanför EU, 25 % moms', '22', false),
  (4535, 'Inköp av tjänster från annat EU-land, 25 %', '21', false),
  (4545, 'Import av råvaror och material, 25 % moms', '50', false),
  (4610, 'Inköp av tjänster och underentreprenader', null, false),
  (5010, 'Lokalhyra', null, false),
  (5410, 'Förbrukningsinventarier', null, true),
  (5420, 'Programvaror', null, true),
  (5460, 'Förbrukningsmaterial', null, false),
  (5800, 'Resekostnader', null, true),
  (5910, 'Annonsering', null, true),
  (5930, 'Reklamtrycksaker och direktreklam', null, false),
  (5990, 'Övriga kostnader för reklam och PR', null, false),
  (6071, 'Representation, avdragsgill', null, false),
  (6072, 'Representation, ej avdragsgill', null, false),
  (6110, 'Kontorsmateriel', null, false),
  (6211, 'Fast telefoni', null, false),
  (6212, 'Mobiltelefon', null, true),
  (6230, 'Datakommunikation', null, false),
  (6250, 'Porto', null, false),
  (6310, 'Företagsförsäkringar', null, true),
  (6420, 'Ersättningar till revisor', null, false),
  (6530, 'Redovisningstjänster', null, true),
  (6540, 'IT-tjänster', null, true),
  (6550, 'Konsultarvoden', null, true),
  (6570, 'Bankkostnader', null, true),
  (6590, 'Övriga externa tjänster', null, false),
  (6970, 'Tidningar, facklitteratur, m.m.', null, false),
  (6980, 'Föreningsavgifter', null, false),
  (6990, 'Övriga externa kostnader', null, false),
  (6991, 'Övriga externa kostnader, avdragsgilla', null, true),
  (6992, 'Övriga externa kostnader, ej avdragsgilla', null, true),
  (7210, 'Löner till tjänstemän', null, false),
  (7220, 'Löner till företagsledare', null, false),
  (7510, 'Arbetsgivaravgifter 31,42 %', null, false),
  (7533, 'Särskild löneskatt för pensionskostnader', null, false),
  (7690, 'Övriga personalkostnader', null, false),
  (7832, 'Avskrivningar på inventarier, verktyg och installationer', null, false),
  (7960, 'Valutakursförluster på fordringar och skulder av rörelsekaraktär', null, false),
  (8310, 'Ränteintäkter från omsättningstillgångar', null, false),
  (8314, 'Skattefria ränteintäkter', null, false),
  (8410, 'Räntekostnader för långfristiga skulder', null, false),
  (8423, 'Räntekostnader för skatter och avgifter', null, false),
  (8910, 'Skatt som belastar årets resultat', null, false),
  (8999, 'Årets resultat', null, false)
on conflict (number) do nothing;

update public.bank_accounts set ledger_account = 1930 where ledger_account is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bank_accounts_ledger_account_fkey'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_ledger_account_fkey
      foreign key (ledger_account) references public.accounting_accounts(number);
  end if;
end;
$$;

alter table public.bank_accounts alter column ledger_account set default 1930;

-- KONTERINGSREGLER: startförslag för vanliga motparter. Momsen är en gissning
-- utifrån var leverantören normalt fakturerar från, kvittot avgör.
insert into public.accounting_rules (pattern, direction, account, vat_code) values
  ('aktiekapital', 'in', 2081, 'none'),
  ('aktieägartillskott', 'in', 2093, 'none'),
  ('aktieagartillskott', 'in', 2093, 'none'),
  ('ränta', 'in', 8310, 'none'),
  ('skatteverket', 'any', 1630, 'none'),
  ('lunar', 'out', 6570, 'none'),
  ('bankintyg', 'out', 6570, 'none'),
  ('bankgiro', 'out', 6570, 'none'),
  ('fee', 'out', 6570, 'none'),
  ('bolagsverket', 'out', 6991, 'none'),
  ('verksamt', 'out', 6991, 'none'),
  ('registrera aktiebolag', 'out', 6991, 'none'),
  ('anthropic', 'out', 6540, 'eu_rc'),
  ('claude', 'out', 6540, 'eu_rc'),
  ('google', 'out', 6540, 'eu_rc'),
  ('microsoft', 'out', 6540, 'eu_rc'),
  ('apple', 'out', 6540, 'eu_rc'),
  ('adobe', 'out', 5420, 'eu_rc'),
  ('stripe', 'out', 6570, 'eu_rc'),
  ('vercel', 'out', 6540, 'noneu_rc'),
  ('supabase', 'out', 6540, 'noneu_rc'),
  ('github', 'out', 6540, 'noneu_rc'),
  ('cloudflare', 'out', 6540, 'noneu_rc'),
  ('resend', 'out', 6540, 'noneu_rc'),
  ('openai', 'out', 6540, 'noneu_rc'),
  ('figma', 'out', 5420, 'noneu_rc'),
  ('godaddy', 'out', 6540, 'noneu_rc'),
  ('netonnet', 'out', 5410, 'se25'),
  ('webhallen', 'out', 5410, 'se25'),
  ('elgiganten', 'out', 5410, 'se25'),
  ('inet', 'out', 5410, 'se25'),
  ('telia', 'out', 6212, 'se25'),
  ('tele2', 'out', 6212, 'se25'),
  ('telenor', 'out', 6212, 'se25'),
  ('fortnox', 'out', 6530, 'se25'),
  ('visma', 'out', 6530, 'se25'),
  ('bokio', 'out', 6530, 'se25'),
  ('postnord', 'out', 6250, 'se25'),
  ('uber', 'out', 5800, 'se6'),
  ('visitkort', 'out', 5930, 'se25')
on conflict (pattern) do nothing;

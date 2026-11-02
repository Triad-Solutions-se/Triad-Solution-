-- Avtalsspecifika val för Villkoren och underskrifterna.
--
-- agreements.price_adjustment: false tar bort den årliga prisjusteringen i
--   Villkorens punkt 8, t.ex. när utrymme för leverantörernas prishöjningar
--   redan ingår i priset.
-- agreements.sla_credits: false tar bort krediten vid driftstörning i punkt
--   3.1. Tillgänglighetsmålet står kvar men ger ingen ersättning.
-- agreements.customer_signatories: antal underskrifter för Kunden i Villkoren
--   och Bilaga 1, t.ex. 2 för en förening som tecknas av två firmatecknare.
--
-- Koden klarar sig utan kolumnerna (valen döljs) tills migrationen är körd.

alter table public.agreements
  add column if not exists price_adjustment boolean not null default true,
  add column if not exists sla_credits boolean not null default true,
  add column if not exists customer_signatories smallint not null default 1
    check (customer_signatories between 1 and 3);

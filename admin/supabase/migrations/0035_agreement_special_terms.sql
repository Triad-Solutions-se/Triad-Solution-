-- Avtalsspecifika villkor + kontaktpersonens roll.
--
-- agreements.special_terms: fritext som renderas som "Bilaga 1 – Särskilda
--   villkor" efter Villkoren i avtals-PDF:en. Där ligger en enskild kunds
--   avvikelser från de allmänna Villkoren (villkor.ts), så att mallen inte
--   behöver ändras för alla kunder. Tom = ingen bilaga.
-- customers.contact_role: kontaktpersonens roll/befattning. Fyller
--   [ROLL/BEFATTNING] i PUB-avtalets avsnitt 11.
--
-- Koden klarar sig utan kolumnerna (fälten döljs) tills migrationen är körd.

alter table public.agreements
  add column if not exists special_terms text;

alter table public.customers
  add column if not exists contact_role text;

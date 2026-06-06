-- Supermind: roll + expertis per medlem, så att AI:n vet vem som passar för
-- vilka uppgifter. Lagras på member_capacity (redigeras i Inställningar
-- tillsammans med veckokapaciteten).
--   role   — kort titel/ansvarsområde, t.ex. "Backend & infra", "Sälj & kund".
--   skills — fritext: kompetenser och vilken sorts arbete som passar personen.

alter table public.member_capacity
  add column if not exists role   text,
  add column if not exists skills text;

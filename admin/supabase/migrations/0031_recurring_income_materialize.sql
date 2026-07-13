-- Återkommande intäkter genererar nu riktiga income-rader (materialisering
-- sker vid sidladdning av Ekonomi-sidan). Kolumnen länkar en genererad rad
-- till sin källa, och unikt index gör genereringen idempotent — samma
-- förfallodatum kan aldrig skapas två gånger.

alter table public.income
  add column if not exists recurring_income_id uuid references public.recurring_income(id) on delete set null;

-- NULL räknas som distinkt i unika index, så manuellt skapade intäkter
-- (recurring_income_id is null) påverkas inte.
create unique index if not exists income_recurring_occurrence_uidx
  on public.income (recurring_income_id, date);

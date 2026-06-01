-- Line items för engångskostnad och återkommande månadskostnad. Tidigare
-- hade en offert exakt ett pris + en rabatt per kategori — nu en array
-- av "items" där varje rad har egen beskrivning, à-pris och rabatt.
--
-- Item-shape (JSONB):
--   { "id": "uuid-str", "description": "...", "unit_price": 1000, "discount_pct": 10 }
--
-- Legacy-kolumnerna project_price / monthly_price / *_discount_pct behålls
-- av två skäl:
--   1. Listvyn (admin/templates/offerter) summerar dem direkt utan att
--      behöva traversera items.
--   2. Befintliga rader/avtal som ännu inte sparats om fortsätter funka i
--      PDF/XLSX-renderingen via fallback.
-- Vid spara skriver editorn project_price = SUM(unit_price * (1 - disc/100))
-- över items, och nollställer den globala discount_pct (rabatten är nu
-- per rad).

alter table public.offers
  add column if not exists project_items jsonb not null default '[]'::jsonb,
  add column if not exists monthly_items jsonb not null default '[]'::jsonb;

-- Backfill: bygg en single-item array av befintligt pris + rabatt för rader
-- där items-arrayen ännu inte är populerad. Tomma priser hoppas över så vi
-- inte skapar "tomma" placeholder-items.
update public.offers
   set project_items = jsonb_build_array(
         jsonb_build_object(
           'id', gen_random_uuid()::text,
           'description', 'Projektkostnad (engångsavgift)',
           'unit_price', project_price,
           'discount_pct', coalesce(project_discount_pct, 0)
         )
       )
 where project_items = '[]'::jsonb
   and project_price is not null
   and project_price > 0;

update public.offers
   set monthly_items = jsonb_build_array(
         jsonb_build_object(
           'id', gen_random_uuid()::text,
           'description', 'Underhållsavgift (per månad)',
           'unit_price', monthly_price,
           'discount_pct', coalesce(monthly_discount_pct, 0)
         )
       )
 where monthly_items = '[]'::jsonb
   and monthly_price is not null
   and monthly_price > 0;

-- Flera extra-sektioner per offert. Ersätter singel-sektionen
-- custom_header/custom_text med en jsonb-array:
--   [{ "id": "...", "header": "...", "text": "..." }, ...]
-- Legacy-kolumnerna behålls som fallback för gamla offerter och speglas
-- från första sektionen vid spara.

alter table public.offers
  add column if not exists custom_sections jsonb not null default '[]'::jsonb;

-- Backfill: lyft in befintlig custom_header/custom_text som första sektionen
-- där en sådan finns och custom_sections ännu är tom.
update public.offers
set custom_sections = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'header', coalesce(custom_header, ''),
    'text', coalesce(custom_text, '')
  )
)
where custom_sections = '[]'::jsonb
  and (
    nullif(trim(coalesce(custom_header, '')), '') is not null
    or nullif(trim(coalesce(custom_text, '')), '') is not null
  );

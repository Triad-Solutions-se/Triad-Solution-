-- Valfri extra-sektion per offert som visas direkt efter projektbeskrivningen.
-- - custom_header: egen rubrik för sektionen (fritext per offert)
-- - custom_text: brödtext under rubriken
-- Båda är frivilliga; sektionen renderas bara om minst ett av fälten är ifyllt.

alter table public.offers
  add column if not exists custom_header text,
  add column if not exists custom_text text;

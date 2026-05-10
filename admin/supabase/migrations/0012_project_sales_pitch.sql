-- Per-project sales pitch shown on the leads page during cold calls.

alter table public.projects
  add column if not exists sales_pitch text;

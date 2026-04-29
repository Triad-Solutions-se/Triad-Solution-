-- Optional external link attached to a project (e.g. live URL, repo, brief doc).
-- Rendered as a clickable link in the project info panel.

alter table public.projects
  add column if not exists external_url text;

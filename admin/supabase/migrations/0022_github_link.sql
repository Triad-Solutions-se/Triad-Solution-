-- Supermind Fas 1: koppla varje projekt till ett GitHub-repo.
-- Vi lagrar owner/repo separat så att server-koden kan slå mot GitHub-API:t.
-- installation_id är förberett för en framtida GitHub App; med en
-- fine-grained PAT (env GITHUB_TOKEN) lämnas det null.

alter table public.projects
  add column if not exists github_owner           text,
  add column if not exists github_repo            text,
  add column if not exists github_installation_id bigint;

-- Inga RLS-ändringar behövs: projects-policyn (is_member) täcker de nya
-- kolumnerna eftersom RLS gäller per rad, inte per kolumn.

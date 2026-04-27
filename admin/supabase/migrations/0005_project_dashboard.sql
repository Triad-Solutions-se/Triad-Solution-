-- Per-project dashboard: contact fields on projects + per-project file uploads.

-- PROJECT CONTACT -----------------------------------------------------
alter table public.projects
  add column if not exists contact_name  text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- PROJECT FILES -------------------------------------------------------
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'document', -- document | logo | other
  label text,
  file_path text not null, -- path inside the 'project-files' storage bucket
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz default now()
);
create index if not exists project_files_project_idx on public.project_files (project_id);
create index if not exists project_files_kind_idx on public.project_files (kind);

-- RLS -----------------------------------------------------------------
alter table public.project_files enable row level security;
drop policy if exists project_files_member on public.project_files;
create policy project_files_member on public.project_files
  for all using (public.is_member()) with check (public.is_member());

-- STORAGE BUCKET ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

do $$
declare
  op text;
  pol text;
begin
  foreach op in array array['select','insert','update','delete']
  loop
    pol := 'project-files_' || op;
    execute format('drop policy if exists %I on storage.objects;', pol);
    if op = 'insert' then
      execute format(
        'create policy %I on storage.objects for %s with check (bucket_id = %L and public.is_member());',
        pol, op, 'project-files'
      );
    else
      execute format(
        'create policy %I on storage.objects for %s using (bucket_id = %L and public.is_member());',
        pol, op, 'project-files'
      );
    end if;
  end loop;
end $$;

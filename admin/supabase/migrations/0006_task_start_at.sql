-- Tasks can now declare an explicit start time (used by the project timeline).
alter table public.tasks
  add column if not exists start_at timestamptz;

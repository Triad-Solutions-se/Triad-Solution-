-- Supermind Fas 1: tabeller för AI-lagret. Skapas redan nu (additivt och
-- ofarligt) så att Fas 2/3 kan börja skriva mot dem utan ny migrationsrunda.
--   ai_threads/ai_messages — konversationer (ev. kopplade till ett projekt).
--   ai_runs/ai_actions      — revisionslogg för autonoma körningar och
--                             varje verktygsanrop AI:n gör (med ångra-stöd).

create table if not exists public.ai_threads (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_threads_project_idx on public.ai_threads (project_id);

create table if not exists public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.ai_threads(id) on delete cascade,
  role       text not null, -- user | assistant | tool | system
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_thread_idx on public.ai_messages (thread_id);

create table if not exists public.ai_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                 -- chat | daily_briefing | triage | ...
  status     text not null default 'running', -- running | done | error | halted
  summary    text,
  tokens     int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_actions (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid references public.ai_runs(id) on delete cascade,
  tool       text not null,
  args       jsonb not null default '{}'::jsonb,
  result     jsonb,
  tier       text not null default 'green', -- green | yellow | red
  reversible boolean not null default true,
  undone     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_actions_run_idx on public.ai_actions (run_id);

-- RLS: samma medlems-modell som övriga tabeller.
alter table public.ai_threads  enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_runs     enable row level security;
alter table public.ai_actions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_threads','ai_messages','ai_runs','ai_actions']
  loop
    execute format('drop policy if exists %I on public.%I;', t||'_member', t);
    execute format('create policy %I on public.%I for all using (public.is_member()) with check (public.is_member());', t||'_member', t);
  end loop;
end $$;

drop trigger if exists trg_ai_threads_updated on public.ai_threads;
create trigger trg_ai_threads_updated
  before update on public.ai_threads
  for each row execute function public.touch_updated_at();

-- Tasks now support multiple assignees. Replace the single-FK assignee_id
-- with a uuid[] column. Element-level FK isn't enforced by Postgres on
-- array columns; the UI filters out unknown ids on join.

alter table public.tasks
  add column if not exists assignee_ids uuid[] not null default '{}';

-- Backfill from the old single-assignee column.
update public.tasks
   set assignee_ids = array[assignee_id]
 where assignee_id is not null
   and cardinality(assignee_ids) = 0;

-- Drop the old single-assignee column. The FK constraint and the
-- tasks_assignee_idx index from migration 0001 fall away with it.
alter table public.tasks
  drop column if exists assignee_id;

-- GIN index for "tasks assigned to <id>" filters.
create index if not exists tasks_assignee_ids_idx
  on public.tasks using gin (assignee_ids);

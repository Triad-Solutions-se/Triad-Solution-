-- Supermind: gör chattar privata per konto. Tidigare gällde is_member() på
-- ai-tabellerna, vilket lät alla medlemmar läsa varandras chattar. Nu ser varje
-- medlem bara sina egna trådar, meddelanden, körningar och verktygsloggar —
-- databasen tvingar detta, inte bara UI:t.

-- ai_runs behöver en ägare för att kunna scopas (summary innehåller svarstext).
alter table public.ai_runs
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Byt ut de gamla is_member()-policyerna mot ägar-scopade.

-- Trådar: bara skaparen.
drop policy if exists ai_threads_member on public.ai_threads;
drop policy if exists ai_threads_owner on public.ai_threads;
create policy ai_threads_owner on public.ai_threads
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Meddelanden: via förälder-trådens ägare.
drop policy if exists ai_messages_member on public.ai_messages;
drop policy if exists ai_messages_owner on public.ai_messages;
create policy ai_messages_owner on public.ai_messages
  for all
  using (
    exists (
      select 1 from public.ai_threads t
      where t.id = ai_messages.thread_id and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_threads t
      where t.id = ai_messages.thread_id and t.created_by = auth.uid()
    )
  );

-- Körningar: bara ägaren.
drop policy if exists ai_runs_member on public.ai_runs;
drop policy if exists ai_runs_owner on public.ai_runs;
create policy ai_runs_owner on public.ai_runs
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Verktygsloggar: via förälder-körningens ägare.
drop policy if exists ai_actions_member on public.ai_actions;
drop policy if exists ai_actions_owner on public.ai_actions;
create policy ai_actions_owner on public.ai_actions
  for all
  using (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_actions.run_id and r.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_actions.run_id and r.created_by = auth.uid()
    )
  );

-- Tid per person: planerad tid (kalendern) och loggad tid (projekttimern).
--
-- Summeras i databasen och inte i appen: PostgREST returnerar som mest 1000
-- rader per anrop, så totalen över all tid skulle annars tyst bli för låg när
-- historiken växer.
--
-- Veckotiden räknar bara den del av ett pass som ligger inom veckan (svensk
-- tid), och en timer som går räknas fram till nu, precis som på projektsidan.
-- security invoker: RLS gäller, så den som inte är medlem får inga rader.

create or replace function public.member_time_summary(p_week_start date)
returns table (
  profile_id           uuid,
  planned_week_minutes integer,
  logged_week_minutes  integer,
  logged_total_minutes integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with week as (
    select p_week_start::timestamp at time zone 'Europe/Stockholm' as starts_at,
           (p_week_start + 7)::timestamp at time zone 'Europe/Stockholm' as ends_at
  ),
  logged as (
    select e.profile_id,
           extract(epoch from coalesce(e.ended_at, now()) - e.started_at) / 60 as total_minutes,
           greatest(0, extract(epoch from
             least(coalesce(e.ended_at, now()), w.ends_at) - greatest(e.started_at, w.starts_at)
           )) / 60 as week_minutes
      from public.time_entries e
     cross join week w
  )
  select p.id,
         coalesce((
           select sum(b.end_minute - b.start_minute)
             from public.work_blocks b
            where b.profile_id = p.id
              and b.work_date between p_week_start and p_week_start + 6
         ), 0)::integer,
         coalesce((
           select round(sum(l.week_minutes)) from logged l where l.profile_id = p.id
         ), 0)::integer,
         coalesce((
           select round(sum(l.total_minutes)) from logged l where l.profile_id = p.id
         ), 0)::integer
    from public.profiles p;
$$;

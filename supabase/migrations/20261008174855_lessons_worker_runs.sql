-- Scope: EU only (the `lessons` writer schema exists only on the EU project).
-- A small ring buffer where the Worker's every-5-minutes job notes how each run ended (sent N emails, nothing
-- to send, no SMTP settings, tick failed, ...). The Worker's own logs are not kept anywhere we can query, and on
-- 2026-10-08 the job silently never reached the writer; this makes the next such case visible with plain SQL.
-- Written only through public.lesson_worker_note (service_role); the last 1000 notes are kept.
create table lessons.worker_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  job text not null,
  outcome text not null,
  detail text
);
alter table lessons.worker_runs enable row level security;
revoke all on lessons.worker_runs from public, anon, authenticated;

create function public.lesson_worker_note(p_job text, p_outcome text, p_detail text default null)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  insert into lessons.worker_runs (job, outcome, detail)
  values (left(p_job, 40), left(p_outcome, 60), left(p_detail, 300));
  -- Keep the newest 1000 (a WHERE is required: PostgREST sessions run with pg-safeupdate).
  delete from lessons.worker_runs where id <= (select max(id) from lessons.worker_runs) - 1000;
end;
$$;
revoke all on function public.lesson_worker_note(text, text, text) from public, anon, authenticated;
grant execute on function public.lesson_worker_note(text, text, text) to service_role;

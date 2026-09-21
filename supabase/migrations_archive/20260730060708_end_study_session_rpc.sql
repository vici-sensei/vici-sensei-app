-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- POST /api/study/session/end previously computed cards_reviewed/cards_correct
-- by matching review_logs.reviewed_at against a [study_sessions.started_at,
-- endedAt] window, where started_at came from Postgres's now() but endedAt
-- came from new Date() on whichever machine runs the Next.js server. If that
-- machine's clock disagrees with the database's (e.g. a wrong system clock),
-- the window can end up empty or inverted -- reviewed count silently drops
-- to 0, accuracy shows "--", and duration_seconds goes negative.
--
-- Fixes this two ways:
--   1. review_logs gets a session_id column, so a review is tied to its
--      session directly instead of being inferred from a timestamp range.
--   2. end_study_session() does the "set ended_at, recompute
--      cards_reviewed/cards_correct, and return duration_seconds" work in
--      one Postgres statement, so every timestamp involved (started_at,
--      ended_at, and their difference) comes from the same clock -- the
--      app server's clock never enters the calculation.

alter table public.review_logs
  add column session_id bigint references public.study_sessions(id) on delete set null;

create index idx_review_logs_session on public.review_logs using btree (session_id);

create or replace function public.end_study_session(p_user_id uuid, p_session_id bigint)
returns table (
  id bigint,
  started_at timestamptz,
  ended_at timestamptz,
  cards_reviewed integer,
  cards_correct integer,
  duration_seconds integer
)
language sql
volatile
as $function$
  with counts as (
    select
      count(*)::integer as reviewed,
      count(*) filter (where correct)::integer as correct
    from public.review_logs
    where session_id = p_session_id
      and user_id = p_user_id
      and undone = false
  )
  update public.study_sessions s
  set ended_at = now(),
      cards_reviewed = counts.reviewed,
      cards_correct = counts.correct
  from counts
  where s.id = p_session_id
    and s.user_id = p_user_id
  returning s.id, s.started_at, s.ended_at, s.cards_reviewed, s.cards_correct,
            extract(epoch from (s.ended_at - s.started_at))::integer as duration_seconds;
$function$
;

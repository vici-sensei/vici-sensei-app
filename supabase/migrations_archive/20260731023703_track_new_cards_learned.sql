-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The study summary page only showed cards_reviewed, not how many new
-- kanji/vocab cards were introduced during the session. Mirrors the
-- session_id approach used for review_logs in 20260730_end_study_session_rpc.sql:
-- tag each introduced card with the session it was introduced in, then have
-- end_study_session() count and persist them alongside cards_reviewed.

alter table public.study_sessions
  add column if not exists new_cards_learned integer not null default 0;

alter table public.user_kanji_meaning_progress
  add column if not exists session_id bigint references public.study_sessions(id) on delete set null;

alter table public.user_vocabulary_progress
  add column if not exists session_id bigint references public.study_sessions(id) on delete set null;

create index if not exists idx_user_kanji_meaning_progress_session on public.user_kanji_meaning_progress using btree (session_id);
create index if not exists idx_user_vocabulary_progress_session on public.user_vocabulary_progress using btree (session_id);

-- Postgres won't let CREATE OR REPLACE change a function's return columns
-- (it's adding new_cards_learned to the returns table), so drop it first.
drop function if exists public.end_study_session(uuid, bigint);

create function public.end_study_session(p_user_id uuid, p_session_id bigint)
returns table (
  id bigint,
  started_at timestamptz,
  ended_at timestamptz,
  cards_reviewed integer,
  cards_correct integer,
  new_cards_learned integer,
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
  ),
  new_cards as (
    select
      (
        (select count(*) from public.user_kanji_meaning_progress
         where session_id = p_session_id and user_id = p_user_id)
        +
        (select count(*) from public.user_vocabulary_progress
         where session_id = p_session_id and user_id = p_user_id)
      )::integer as learned
  )
  update public.study_sessions s
  set ended_at = now(),
      cards_reviewed = counts.reviewed,
      cards_correct = counts.correct,
      new_cards_learned = new_cards.learned
  from counts, new_cards
  where s.id = p_session_id
    and s.user_id = p_user_id
  returning s.id, s.started_at, s.ended_at, s.cards_reviewed, s.cards_correct,
            s.new_cards_learned, extract(epoch from (s.ended_at - s.started_at))::integer as duration_seconds;
$function$
;

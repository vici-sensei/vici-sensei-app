-- Run this manually in DBeaver or the Supabase SQL editor.
-- Adds the study_sessions table (used by POST /api/study/session/start and /end)
-- and, on review_logs: an `undone` flag (soft-delete instead of hard-delete so
-- review history/stats stay intact) plus full "before" snapshot columns so
-- POST /api/study/review/undo can restore a progress row exactly instead of
-- only approximating it from ease_factor_before/interval_before.

create table public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cards_reviewed integer not null default 0,
  cards_correct integer not null default 0
);

alter table public.study_sessions enable row level security;

create policy "Users manage own study_sessions"
  on public.study_sessions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_study_sessions_user_started on public.study_sessions using btree (user_id, started_at);

alter table public.review_logs
  add column undone boolean not null default false,
  add column status_before text,
  add column repetitions_before integer,
  add column lapses_before integer,
  add column learning_step_before integer,
  add column due_at_before timestamptz;

-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- New one-time "kanji basics" lesson: a fixed 3-card sequence (what is kanji -> what is furigana
-- -> what are JLPT levels/you're starting at N5) shown exactly once, right before the very first
-- "New kanji" card, to standard-track students who are still at N5 and have never seen a single
-- kanji_meaning/kanji_reading/vocab_meaning card -- kana progress doesn't matter, so a student who
-- already knew hiragana/katakana and picked N5 as their starting level during onboarding
-- (StepLevel.tsx's level-picker branch) qualifies too. Mirrors the new_hiragana_rule/
-- new_katakana_rule pattern (20260904_kana_rule_cards.sql) as closely as possible: read-only, no
-- grading, "Next" just marks each step permanently seen and it never reappears.
--
-- Unlike a kana rule (one DB row per rule, reused across every student), there's no reference
-- content table here -- the 3 steps' copy, including step 2's fixed furigana example (毎日), is
-- fixed and lives entirely in the client component (NewKanjiBasicsIntroCard.tsx). This RPC only
-- decides ELIGIBILITY: which of the 3 fixed steps, if any, remain unseen for this user.
--
-- Gated on "current JLPT level = N5" (not just "enabled_levels contains N5"), reusing
-- check_and_advance_jlpt_level's own v_order/array_position logic -- a student who already knew
-- some Japanese can pick N4/N3/... as their starting level during onboarding (StepLevel.tsx) with
-- zero progress rows, and this lesson's "you're starting at N5" copy would be simply wrong for
-- them, so eligibility can't rest on "no progress yet" alone.

-- ---------------------------------------------------------------------------
-- 1. Seen-state table -- one row per step (1, 2, or 3) ever confirmed, per user.
-- ---------------------------------------------------------------------------
create table public.user_kanji_basics_progress (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  step int2 not null,
  session_id int8 null references public.study_sessions(id) on delete set null,
  seen_at timestamptz not null default now(),
  constraint user_kanji_basics_progress_step_check check (step in (1, 2, 3)),
  constraint user_kanji_basics_progress_user_id_step_key unique (user_id, step)
);
create index idx_ukbp_user on public.user_kanji_basics_progress using btree (user_id);
alter table public.user_kanji_basics_progress enable row level security;

create policy "Users manage own user_kanji_basics_progress" on public.user_kanji_basics_progress
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

-- ---------------------------------------------------------------------------
-- 2. get_new_kanji_basics_candidates: which of the 3 fixed steps remain unseen for this user,
--    gated exactly like get_new_kanji_candidates (study_track = 'standard' and study_kanji) plus
--    the "still at N5" and "never seen a kanji/vocab card" checks described above.
-- ---------------------------------------------------------------------------
create or replace function public.get_new_kanji_basics_candidates(p_user_id uuid)
returns table(step smallint)
language sql
stable
as $function$
  with current_level as (
    select (array['N5', 'N4', 'N3', 'N2', 'N1'])[
      max(array_position(array['N5', 'N4', 'N3', 'N2', 'N1'], lvl))
    ] as level
    from public.user_study_settings s
    cross join unnest(s.enabled_levels) as lvl
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
  )
  select steps.step
  from unnest(array[1, 2, 3]::smallint[]) as steps(step)
  where exists (select 1 from current_level where level = 'N5')
    and not exists (select 1 from public.user_kanji_meaning_progress where user_id = p_user_id)
    and not exists (select 1 from public.user_kanji_reading_progress where user_id = p_user_id)
    and not exists (select 1 from public.user_vocabulary_progress where user_id = p_user_id)
    and not exists (
      select 1 from public.user_kanji_basics_progress b
      where b.user_id = p_user_id and b.step = steps.step
    )
  order by steps.step;
$function$;

grant execute on function public.get_new_kanji_basics_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. introduce_kanji_basics: mark one step permanently seen. No cap, no SRS state -- a plain
--    insert, same shape as introduce_hiragana_rule/introduce_katakana_rule. p_timezone is accepted
--    (unused) so the client's generic introduceCard() helper (lib/data/introduce.ts) can call this
--    exactly like every other introduce_* RPC without a special case.
-- ---------------------------------------------------------------------------
create or replace function public.introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
begin
  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
  ) then
    raise exception 'Kanji study is not enabled for this user' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_kanji_basics_progress
    where user_id = p_user_id and step = p_step
  ) then
    raise exception 'This kanji basics step has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_kanji_basics_progress (user_id, step, session_id)
  values (p_user_id, p_step, p_session_id);
end;
$function$;

grant execute on function public.introduce_kanji_basics(uuid, smallint, text, bigint) to authenticated;

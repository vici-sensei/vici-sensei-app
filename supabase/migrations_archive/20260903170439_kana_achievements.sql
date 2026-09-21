-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- General-purpose achievement badges (kana phase) -- separate from public.user_badges, which is
-- shape-specific to reading-test attempts (test_type/attempt_number/percent, all NOT NULL and
-- upserted in place). An achievement here is a one-time, permanent unlock: (user_id,
-- achievement_key) with just an earned_at. Once earned it is never removed, even if the
-- underlying mastery count later dips (e.g. a lapsed review knocks a character's status back out
-- of review/relearning) -- same "permanent trophy" semantics as Steam achievements.
--
-- Only written by award_achievement (security definer) -- no insert/update/delete policy for
-- users, so an achievement stays a trustworthy record of what actually happened.
--
-- "Learned"/"mastered" here means status in ('review', 'relearning'), the exact condition
-- get_level_progress uses for its own `learned` column (20260907_kana_rule_level_progress.sql) --
-- so an achievement can never disagree with what the dashboard's own progress rings show.
create table public.user_achievements (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_key text not null,
  earned_at timestamptz not null default now(),
  constraint user_achievements_user_key_key unique (user_id, achievement_key)
);
create index idx_user_achievements_user on public.user_achievements (user_id);
alter table public.user_achievements enable row level security;

create policy "Users view own user_achievements" on public.user_achievements
  as permissive for select
  using (((select auth.uid()) = user_id) and account_is_active(user_id));

-- Insert-only upsert: an achievement's earned_at is set once and never touched again.
create or replace function public.award_achievement(p_user_id uuid, p_key text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.user_achievements (user_id, achievement_key)
  values (p_user_id, p_key)
  on conflict (user_id, achievement_key) do nothing;
$function$;

-- Recomputes every hiragana/katakana achievement for p_user_id and awards any newly-met one.
-- Idempotent and cheap (hiragana/katakana are ~150 rows total, a given user's progress rows for
-- either script never exceed that) -- safe to call on every relevant progress change rather than
-- trying to diff "what just changed".
--
-- Kana-type achievement thresholds are picked to match how many study_enabled, non-rule rows
-- actually exist per (script, kana_type) -- see the counts this was authored against:
-- hiragana seion 46 / dakuten 20 / handakuten 5 / yoon 6 / sokuon 3 (no achievements yet) /
-- n_gemination 1 (81 total); katakana seion 45 / dakuten 20 / handakuten 5 / yoon 6 / sokuon 3 /
-- n_gemination 1 / choonpu 3 / extended 8 (91 total). A threshold at or above a group's total is
-- that group's "_all" achievement; n_gemination and hiragana sokuon have no "first"/count
-- achievements of their own since their totals are too small to distinguish from "all" (or, for
-- hiragana sokuon, weren't in the requested list at all).
create or replace function public.evaluate_kana_achievements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hiragana_total int;
  v_hiragana_learned int;
  v_katakana_total int;
  v_katakana_learned int;
  v_row record;
begin
  -- ===== Hiragana: aggregate across every kana_type =====
  select count(*) into v_hiragana_total from public.hiragana where entry_kind != 'rule' and study_enabled;
  select count(*) into v_hiragana_learned from public.user_hiragana_progress
    where user_id = p_user_id and status in ('review', 'relearning');

  if v_hiragana_learned >= 1 then perform public.award_achievement(p_user_id, 'hiragana_total_1'); end if;
  if v_hiragana_learned >= 5 then perform public.award_achievement(p_user_id, 'hiragana_total_5'); end if;
  if v_hiragana_learned >= 10 then perform public.award_achievement(p_user_id, 'hiragana_total_10'); end if;
  if v_hiragana_learned >= 20 then perform public.award_achievement(p_user_id, 'hiragana_total_20'); end if;
  if v_hiragana_learned >= 30 then perform public.award_achievement(p_user_id, 'hiragana_total_30'); end if;
  if v_hiragana_learned >= 40 then perform public.award_achievement(p_user_id, 'hiragana_total_40'); end if;
  if v_hiragana_total > 0 and v_hiragana_learned >= v_hiragana_total then
    perform public.award_achievement(p_user_id, 'hiragana_all');
  end if;

  -- ===== Hiragana: per kana_type =====
  for v_row in
    select h.kana_type as kt,
      count(*) filter (where p.status in ('review', 'relearning')) as learned,
      count(*) as total
    from public.hiragana h
    left join public.user_hiragana_progress p on p.hiragana_id = h.id and p.user_id = p_user_id
    where h.entry_kind != 'rule' and h.study_enabled
    group by h.kana_type
  loop
    if v_row.kt = 'seion' and v_row.total > 0 and v_row.learned >= v_row.total then
      perform public.award_achievement(p_user_id, 'hiragana_seion_all');
    elsif v_row.kt = 'dakuten' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'hiragana_dakuten_1'); end if;
      if v_row.learned >= 5 then perform public.award_achievement(p_user_id, 'hiragana_dakuten_5'); end if;
      if v_row.learned >= 10 then perform public.award_achievement(p_user_id, 'hiragana_dakuten_10'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'hiragana_dakuten_all');
      end if;
    elsif v_row.kt = 'handakuten' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'hiragana_handakuten_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'hiragana_handakuten_all');
      end if;
    elsif v_row.kt = 'yoon' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'hiragana_yoon_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'hiragana_yoon_all');
      end if;
    elsif v_row.kt = 'n_gemination' then
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'hiragana_n_gemination_all');
      end if;
    end if;
  end loop;

  -- ===== Katakana: aggregate across every kana_type =====
  select count(*) into v_katakana_total from public.katakana where entry_kind != 'rule' and study_enabled;
  select count(*) into v_katakana_learned from public.user_katakana_progress
    where user_id = p_user_id and status in ('review', 'relearning');

  if v_katakana_learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_total_1'); end if;
  if v_katakana_learned >= 5 then perform public.award_achievement(p_user_id, 'katakana_total_5'); end if;
  if v_katakana_learned >= 10 then perform public.award_achievement(p_user_id, 'katakana_total_10'); end if;
  if v_katakana_learned >= 20 then perform public.award_achievement(p_user_id, 'katakana_total_20'); end if;
  if v_katakana_learned >= 30 then perform public.award_achievement(p_user_id, 'katakana_total_30'); end if;
  if v_katakana_learned >= 40 then perform public.award_achievement(p_user_id, 'katakana_total_40'); end if;
  if v_katakana_total > 0 and v_katakana_learned >= v_katakana_total then
    perform public.award_achievement(p_user_id, 'katakana_all');
  end if;

  -- ===== Katakana: per kana_type =====
  for v_row in
    select k.kana_type as kt,
      count(*) filter (where p.status in ('review', 'relearning')) as learned,
      count(*) as total
    from public.katakana k
    left join public.user_katakana_progress p on p.katakana_id = k.id and p.user_id = p_user_id
    where k.entry_kind != 'rule' and k.study_enabled
    group by k.kana_type
  loop
    if v_row.kt = 'seion' and v_row.total > 0 and v_row.learned >= v_row.total then
      perform public.award_achievement(p_user_id, 'katakana_seion_all');
    elsif v_row.kt = 'dakuten' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_dakuten_1'); end if;
      if v_row.learned >= 5 then perform public.award_achievement(p_user_id, 'katakana_dakuten_5'); end if;
      if v_row.learned >= 10 then perform public.award_achievement(p_user_id, 'katakana_dakuten_10'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_dakuten_all');
      end if;
    elsif v_row.kt = 'handakuten' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_handakuten_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_handakuten_all');
      end if;
    elsif v_row.kt = 'yoon' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_yoon_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_yoon_all');
      end if;
    elsif v_row.kt = 'sokuon' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_sokuon_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_sokuon_all');
      end if;
    elsif v_row.kt = 'n_gemination' then
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_n_gemination_all');
      end if;
    elsif v_row.kt = 'choonpu' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_choonpu_1'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_choonpu_all');
      end if;
    elsif v_row.kt = 'extended' then
      if v_row.learned >= 1 then perform public.award_achievement(p_user_id, 'katakana_extended_1'); end if;
      if v_row.learned >= 5 then perform public.award_achievement(p_user_id, 'katakana_extended_5'); end if;
      if v_row.total > 0 and v_row.learned >= v_row.total then
        perform public.award_achievement(p_user_id, 'katakana_extended_all');
      end if;
    end if;
  end loop;

  -- ===== Both scripts fully mastered =====
  if v_hiragana_total > 0 and v_hiragana_learned >= v_hiragana_total
     and v_katakana_total > 0 and v_katakana_learned >= v_katakana_total then
    perform public.award_achievement(p_user_id, 'kana_all');
  end if;
end;
$function$;

create or replace function public.user_hiragana_progress_updates_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.evaluate_kana_achievements(new.user_id);
  return new;
end;
$function$;

create trigger user_hiragana_progress_updates_achievements_trigger
  after insert or update of status on public.user_hiragana_progress
  for each row execute function public.user_hiragana_progress_updates_achievements();

create or replace function public.user_katakana_progress_updates_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.evaluate_kana_achievements(new.user_id);
  return new;
end;
$function$;

create trigger user_katakana_progress_updates_achievements_trigger
  after insert or update of status on public.user_katakana_progress
  for each row execute function public.user_katakana_progress_updates_achievements();

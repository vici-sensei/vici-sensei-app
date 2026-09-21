-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Every "is every hiragana/katakana character mastered?" check still counted
-- `count(*) from public.hiragana where entry_kind != 'rule'` as the denominator -- true when that
-- fix was written (20260904_kana_rule_cards.sql), but since
-- 20260906_selective_examples_and_seion_only_drill.sql a non-study_enabled example row can NEVER
-- gain a user_hiragana_progress/user_katakana_progress row at all, so it was left permanently
-- counted in a denominator it can never satisfy -- 100% would never be reachable again, which
-- would have silently broken katakana auto-activation, the kana -> standard track switch, the
-- manual "Study katakana" toggle guard, and the /dashboard level-progress stats for every real
-- user who reaches this point. Same fix shape as before: add `and study_enabled` everywhere that
-- denominator appears. Bodies are otherwise unchanged from 20260904_kana_rule_cards.sql.

create or replace function public.hiragana_auto_activate_katakana()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'review' and old.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      update public.user_study_settings
      set study_katakana = true
      where user_id = new.user_id and study_track = 'kana' and study_katakana = false;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.resume_katakana_on_kana_return()
returns trigger
language plpgsql
as $function$
begin
  if old.study_track = 'standard' and new.study_track = 'kana' and new.study_katakana = false then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      new.study_katakana := true;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.katakana_auto_activate_standard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'review' and old.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_katakana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled)
    and (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      update public.user_study_settings
      set study_track = 'standard',
          study_kanji = true,
          study_vocabulary = true,
          study_hiragana = false,
          study_katakana = false
      where user_id = new.user_id and study_track = 'kana';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_katakana_requires_hiragana_mastered()
returns trigger
language plpgsql
as $function$
begin
  if new.study_katakana = true and old.study_katakana is distinct from true then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      raise exception 'Finish learning all hiragana before you can start katakana.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.hiragana_regression_disables_katakana()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status in ('review', 'relearning') and new.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      update public.user_study_settings
      set study_katakana = false
      where user_id = new.user_id and study_katakana = true;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.get_level_progress(p_user_id uuid, p_level text)
returns table(category text, seen bigint, learned bigint, total bigint)
language sql
stable
as $function$
  select 'kanji'::text as category,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level) as seen,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji where level = p_level) as total

  union all

  select 'kanji_reading'::text,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level) as seen,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji_detail_words kdw
       join public.kanji k on k.id = kdw.kanji_id
       where k.level = p_level) as total

  union all

  select 'vocabulary'::text,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level) as seen,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.vocabulary where jlpt_level = p_level) as total

  union all

  select 'hiragana_reading'::text,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_hiragana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'katakana_reading'::text,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_katakana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as total;
$function$;

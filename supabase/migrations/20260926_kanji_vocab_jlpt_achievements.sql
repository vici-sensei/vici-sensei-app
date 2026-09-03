-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Phase 2 of the achievement system (see 20260924_kana_achievements.sql for phase 1 and its
-- award_achievement helper, reused unchanged here): kanji/vocabulary counts and JLPT-level
-- milestones.
--
-- "A kanji is fully learned" = its kanji_meaning card is mastered (status in ('review',
-- 'relearning')) AND every one of its kanji_reading example-word cards is too -- per product
-- request, learning a kanji's meaning without being able to read it in any word doesn't count. A
-- kanji with zero kanji_detail_words example rows needs only its meaning (nothing else exists to
-- master). This is intentionally stricter than get_level_progress's own 'kanji' category (meaning
-- only) -- but "all N5 kanji" below ends up equivalent to get_level_progress's 'kanji' AND
-- 'kanji_reading' categories both reaching 100%, so it never disagrees with the level-up logic.
--
-- "A word is fully learned" = its vocab_meaning card is mastered -- vocabulary has no separate
-- reading card of its own, so there's nothing else to combine it with.
--
-- No "first N5 kanji"/"first N5 word" achievements -- those are exactly kanji_total_1/word_total_1
-- (N5 is always where a standard-track student starts), matching the original wishlist which only
-- listed "first" for N4 and above.
--
-- Same evaluate-then-thin-trigger-wrapper split as evaluate_kana_achievements
-- (20260924_kana_achievements.sql), so this can also be called directly for the one-time backfill
-- at the bottom (existing kanji/vocab progress rows predate this migration and won't retroactively
-- fire a trigger).
create or replace function public.evaluate_kanji_vocab_achievements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kanji_learned int;
  v_word_learned int;
  v_level text;
  v_level_kanji_total int;
  v_level_kanji_learned int;
  v_level_word_total int;
  v_level_word_learned int;
  v_all_have_content boolean;
  v_all_complete boolean;
begin
  -- ===== Global kanji: cumulative across every JLPT level =====
  select count(*) into v_kanji_learned
  from public.kanji k
  where exists (
      select 1 from public.user_kanji_meaning_progress p
      where p.user_id = p_user_id and p.kanji_id = k.id and p.status in ('review', 'relearning')
    )
    and (select count(*) from public.kanji_detail_words kdw where kdw.kanji_id = k.id)
        <= (select count(*) from public.user_kanji_reading_progress p
              where p.user_id = p_user_id and p.kanji_id = k.id and p.status in ('review', 'relearning'));

  if v_kanji_learned >= 1 then perform public.award_achievement(p_user_id, 'kanji_total_1'); end if;
  if v_kanji_learned >= 5 then perform public.award_achievement(p_user_id, 'kanji_total_5'); end if;
  if v_kanji_learned >= 10 then perform public.award_achievement(p_user_id, 'kanji_total_10'); end if;
  if v_kanji_learned >= 50 then perform public.award_achievement(p_user_id, 'kanji_total_50'); end if;
  if v_kanji_learned >= 100 then perform public.award_achievement(p_user_id, 'kanji_total_100'); end if;
  if v_kanji_learned >= 500 then perform public.award_achievement(p_user_id, 'kanji_total_500'); end if;
  if v_kanji_learned >= 1000 then perform public.award_achievement(p_user_id, 'kanji_total_1000'); end if;
  if v_kanji_learned >= 1500 then perform public.award_achievement(p_user_id, 'kanji_total_1500'); end if;
  if v_kanji_learned >= 2000 then perform public.award_achievement(p_user_id, 'kanji_total_2000'); end if;

  -- ===== Global words: cumulative across every JLPT level =====
  select count(*) into v_word_learned
  from public.user_vocabulary_progress
  where user_id = p_user_id and status in ('review', 'relearning');

  if v_word_learned >= 1 then perform public.award_achievement(p_user_id, 'word_total_1'); end if;
  if v_word_learned >= 5 then perform public.award_achievement(p_user_id, 'word_total_5'); end if;
  if v_word_learned >= 10 then perform public.award_achievement(p_user_id, 'word_total_10'); end if;
  if v_word_learned >= 50 then perform public.award_achievement(p_user_id, 'word_total_50'); end if;
  if v_word_learned >= 100 then perform public.award_achievement(p_user_id, 'word_total_100'); end if;
  if v_word_learned >= 500 then perform public.award_achievement(p_user_id, 'word_total_500'); end if;
  if v_word_learned >= 1000 then perform public.award_achievement(p_user_id, 'word_total_1000'); end if;
  if v_word_learned >= 1500 then perform public.award_achievement(p_user_id, 'word_total_1500'); end if;
  if v_word_learned >= 2000 then perform public.award_achievement(p_user_id, 'word_total_2000'); end if;

  -- ===== Per JLPT level =====
  foreach v_level in array array['N5', 'N4', 'N3', 'N2', 'N1']
  loop
    select count(*),
      count(*) filter (where exists (
          select 1 from public.user_kanji_meaning_progress p
          where p.user_id = p_user_id and p.kanji_id = k.id and p.status in ('review', 'relearning')
        )
        and (select count(*) from public.kanji_detail_words kdw where kdw.kanji_id = k.id)
            <= (select count(*) from public.user_kanji_reading_progress p
                  where p.user_id = p_user_id and p.kanji_id = k.id and p.status in ('review', 'relearning')))
      into v_level_kanji_total, v_level_kanji_learned
      from public.kanji k
      where k.level = v_level;

    if v_level <> 'N5' and v_level_kanji_learned >= 1 then
      perform public.award_achievement(p_user_id, 'kanji_' || lower(v_level) || '_1');
    end if;
    if v_level_kanji_total > 0 and v_level_kanji_learned >= v_level_kanji_total then
      perform public.award_achievement(p_user_id, 'kanji_' || lower(v_level) || '_all');
    end if;

    select count(*), count(*) filter (where p.status in ('review', 'relearning'))
      into v_level_word_total, v_level_word_learned
      from public.vocabulary v
      left join public.user_vocabulary_progress p on p.word_id = v.id and p.user_id = p_user_id
      where v.jlpt_level = v_level;

    if v_level <> 'N5' and v_level_word_learned >= 1 then
      perform public.award_achievement(p_user_id, 'word_' || lower(v_level) || '_1');
    end if;
    if v_level_word_total > 0 and v_level_word_learned >= v_level_word_total then
      perform public.award_achievement(p_user_id, 'word_' || lower(v_level) || '_all');
    end if;

    -- "Completed" mirrors check_and_advance_jlpt_level's own bar exactly (kanji, kanji_reading,
    -- and vocabulary categories all fully learned at this level, per get_level_progress) so this
    -- can never disagree with when the level-up modal actually fires.
    select bool_and(total > 0), bool_and(learned >= total)
      into v_all_have_content, v_all_complete
      from public.get_level_progress(p_user_id, v_level)
      where category in ('kanji', 'kanji_reading', 'vocabulary');

    if coalesce(v_all_have_content, false) and coalesce(v_all_complete, false) then
      perform public.award_achievement(p_user_id, lower(v_level) || '_completed');
    end if;
  end loop;
end;
$function$;

create or replace function public.kanji_vocab_progress_updates_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.evaluate_kanji_vocab_achievements(new.user_id);
  return new;
end;
$function$;

-- One shared trigger function across all three progress tables -- each just needs new.user_id,
-- which every one of them has.
create trigger user_kanji_meaning_progress_updates_achievements_trigger
  after insert or update of status on public.user_kanji_meaning_progress
  for each row execute function public.kanji_vocab_progress_updates_achievements();

create trigger user_kanji_reading_progress_updates_achievements_trigger
  after insert or update of status on public.user_kanji_reading_progress
  for each row execute function public.kanji_vocab_progress_updates_achievements();

create trigger user_vocabulary_progress_updates_achievements_trigger
  after insert or update of status on public.user_vocabulary_progress
  for each row execute function public.kanji_vocab_progress_updates_achievements();

-- One-time backfill: any kanji/vocab progress that already existed before this migration won't
-- retroactively fire the triggers above. evaluate_kanji_vocab_achievements only awards (never
-- revokes) and award_achievement is on-conflict-do-nothing, so this is safe to run more than once.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select user_id from public.user_kanji_meaning_progress
    union
    select user_id from public.user_kanji_reading_progress
    union
    select user_id from public.user_vocabulary_progress
  loop
    perform public.evaluate_kanji_vocab_achievements(v_user_id);
  end loop;
end;
$$;

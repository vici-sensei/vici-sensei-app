-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Auto-advances a standard-track user's most advanced enabled JLPT level once every kanji
-- (meaning AND word reading) and vocabulary card at that level has reached status
-- 'review'/'relearning' -- per user request: finishing everything for e.g. N5 should move
-- enabled_levels on to N4 automatically, while keeping N5 itself included.
--
-- "Complete" reuses get_level_progress's own learned/total counts (kanji, kanji_reading,
-- vocabulary categories) rather than re-deriving them, so this can never disagree with what the
-- Settings page's own progress bar already shows the user. Requires both study_kanji and
-- study_vocabulary to be on (kana-track users always have both false, so this is a no-op for
-- them -- their enabled_levels is separately locked to ['N5'] by the kana_level_check constraint).
--
-- The level bump forces include_lower_levels = true and appends just the next level on top of
-- whatever enabled_levels already held -- normalize_enabled_levels (20260822_kana_study_settings.sql)
-- then expands that to the full min..max range itself, which is what keeps the just-finished
-- level included instead of being replaced by it (its collapse-to-single-level branch only fires
-- when include_lower_levels is false).
--
-- No new history/tracking table: once advanced, the "current" (most advanced) level for every
-- future call is the new level, which is naturally incomplete, so this doesn't re-fire on its
-- own. The one exception is N1 (nothing to advance to) -- is_max_level stays true on every call
-- once N1 is fully learned, so the client is responsible for only celebrating that once (see
-- lib/study/levelUpCache.ts).
create or replace function public.check_and_advance_jlpt_level(p_user_id uuid)
returns table(leveled_up boolean, completed_level text, new_level text, is_max_level boolean)
language plpgsql
as $function$
declare
  v_order text[] := array['N5', 'N4', 'N3', 'N2', 'N1'];
  v_settings record;
  v_current_idx int;
  v_current_level text;
  v_next_level text;
  v_all_have_content boolean;
  v_all_complete boolean;
  i int;
begin
  select study_track, study_kanji, study_vocabulary, enabled_levels
    into v_settings
    from public.user_study_settings
    where user_id = p_user_id;

  if v_settings is null
     or v_settings.study_track <> 'standard'
     or not v_settings.study_kanji
     or not v_settings.study_vocabulary
     or v_settings.enabled_levels is null then
    return query select false, null::text, null::text, false;
    return;
  end if;

  v_current_idx := 0;
  for i in 1..array_length(v_settings.enabled_levels, 1) loop
    v_current_idx := greatest(v_current_idx, array_position(v_order, v_settings.enabled_levels[i]));
  end loop;
  if v_current_idx = 0 then
    return query select false, null::text, null::text, false;
    return;
  end if;
  v_current_level := v_order[v_current_idx];

  select bool_and(total > 0), bool_and(learned >= total)
    into v_all_have_content, v_all_complete
    from public.get_level_progress(p_user_id, v_current_level)
    where category in ('kanji', 'kanji_reading', 'vocabulary');

  if not coalesce(v_all_have_content, false) or not coalesce(v_all_complete, false) then
    return query select false, null::text, null::text, false;
    return;
  end if;

  if v_current_idx >= array_length(v_order, 1) then
    -- N1: nothing left to advance to -- still a real milestone, just no settings change.
    return query select true, v_current_level, null::text, true;
    return;
  end if;

  v_next_level := v_order[v_current_idx + 1];

  update public.user_study_settings
    set enabled_levels = array_append(enabled_levels, v_next_level),
        include_lower_levels = true
    where user_id = p_user_id
      and not (v_next_level = any(enabled_levels));

  return query select true, v_current_level, v_next_level, false;
end;
$function$;

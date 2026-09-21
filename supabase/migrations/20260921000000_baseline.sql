-- BASELINE: the whole current state of the vici-sensei database (schema "public" + the hooks it needs
-- in Supabase-managed schemas), replacing the 296 incremental migrations that led here.
-- Generated 2026-09-21 from backup 2026-09-21_1445 (pg_dump 18.4 of the live project).
--
-- On the LIVE project this file must NEVER run: it is recorded as already applied
-- (supabase migration repair --status applied <this version>). It only runs on a new, empty project.
--
-- NOT included (data or per-project values, see RESTORE.md): table rows, vault secret, cron job,
-- Edge Functions, secrets, Auth settings.

-- Extensions (same schemas as production)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: account_is_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.account_is_active(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.users where id = p_user_id and pending_deletion_at is not null
  );
$$;


--
-- Name: acknowledge_achievements(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_achievements(p_keys text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.user_achievements
  set acknowledged_at = now()
  where user_id = auth.uid()
    and achievement_key = any(p_keys)
    and acknowledged_at is null;
$$;


--
-- Name: apply_timezone_preference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_timezone_preference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.preferred_timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.preferred_timezone) then
    raise exception 'Unknown timezone: %', new.preferred_timezone using errcode = '22023';
  end if;

  -- The effective timezone follows the pick while the preference is on. When it's off, `timezone`
  -- is left to set_user_timezone (the browser's), untouched here.
  if new.timezone_preference_enabled then
    new.timezone := new.preferred_timezone;
  end if;

  return new;
end;
$$;


--
-- Name: assign_leaderboard_alias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_leaderboard_alias() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.leaderboard_anonymous and new.leaderboard_alias_id is null then
    select id into new.leaderboard_alias_id
    from public.leaderboard_aliases
    order by random()
    limit 1;
  end if;
  return new;
end;
$$;


--
-- Name: award_achievement(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_achievement(p_user_id uuid, p_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.user_achievements (user_id, achievement_key)
  values (p_user_id, p_key)
  on conflict (user_id, achievement_key) do nothing;
$$;


--
-- Name: cancel_pending_account_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_pending_account_deletion() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  reactivated boolean := false;
begin
  update public.users
  set pending_deletion_at = null
  where id = auth.uid()
    and pending_deletion_at is not null
  returning true into reactivated;

  return coalesce(reactivated, false);
end;
$$;


--
-- Name: check_and_advance_jlpt_level(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_advance_jlpt_level(p_user_id uuid) RETURNS TABLE(leveled_up boolean, completed_level text, new_level text, is_max_level boolean)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: clamp_new_card_caps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clamp_new_card_caps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  caps record;
begin
  select * into caps from public.get_new_card_caps();

  new.new_kanji_per_day := least(new.new_kanji_per_day, caps.kanji_max);
  new.new_vocab_per_day := least(new.new_vocab_per_day, caps.vocab_max);
  new.new_hiragana_per_day := least(new.new_hiragana_per_day, caps.hiragana_max);
  new.new_katakana_per_day := least(new.new_katakana_per_day, caps.katakana_max);

  return new;
end;
$$;


--
-- Name: complete_vocab_batch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_vocab_batch(p_user_id uuid) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
    LANGUAGE sql
    AS $$
  with flipped as (
    update public.user_vocabulary_progress
    set pending_batch = false, due_at = now()
    where user_id = p_user_id
      and pending_batch = true
    returning id, word_id, status, ease_factor, interval_days, repetitions, lapses, learning_step
  )
  select
    'vocab_meaning'::text as exercise_type,
    f.id as progress_id,
    null::bigint as kanji_id, f.word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    v.word, v.kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    v.furiganas,
    v.usually_kana,
    public.vocabulary_primary_meanings(v) as primary_word_meanings,
    public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
    null::text[] as all_word_readings,
    null::text[] as known_kanji_chars,
    null::text as kana_character, null::text as kana_romaji,
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$$;


--
-- Name: compute_review_result(text, numeric, integer, integer, integer, integer, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_review_result(p_status text, p_ease_factor numeric, p_interval_days integer, p_repetitions integer, p_lapses integer, p_learning_step integer, p_rating smallint) RETURNS TABLE(status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer, due_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  c_steps constant integer[] := array[1, 10];
  c_min_ease constant numeric := 1.3;
  c_ease_again constant numeric := 0.2;
  c_ease_hard constant numeric := 0.15;
  c_ease_easy constant numeric := 0.15;
  c_hard_mult constant numeric := 1.2;
  c_easy_mult constant numeric := 1.3;
  c_graduating constant integer := 1;
  c_easy_graduating constant integer := 4;
  c_second constant integer := 6;
  v_next_step integer;
  v_ease numeric;
  v_interval integer;
  v_reps integer;
begin
  if p_status in ('learning', 'relearning') then
    if p_rating = 0 then
      return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
        0, now() + make_interval(mins => c_steps[1]);
    elsif p_rating = 1 then
      return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
        p_learning_step, now() + make_interval(mins => c_steps[p_learning_step + 1]);
    elsif p_rating = 3 then
      return query select 'review'::text, p_ease_factor, c_easy_graduating, p_repetitions + 1, p_lapses,
        0, now() + make_interval(days => c_easy_graduating);
    else
      v_next_step := p_learning_step + 1;
      if v_next_step >= array_length(c_steps, 1) then
        return query select 'review'::text, p_ease_factor, c_graduating, p_repetitions + 1, p_lapses,
          0, now() + make_interval(days => c_graduating);
      else
        return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
          v_next_step, now() + make_interval(mins => c_steps[v_next_step + 1]);
      end if;
    end if;
  else
    if p_rating = 0 then
      v_ease := round(greatest(c_min_ease, p_ease_factor - c_ease_again), 2);
      return query select 'relearning'::text, v_ease, p_interval_days, 0, p_lapses + 1,
        0, now() + make_interval(mins => c_steps[1]);
    elsif p_rating = 1 then
      v_ease := round(greatest(c_min_ease, p_ease_factor - c_ease_hard), 2);
      v_interval := greatest(p_interval_days + 1, round(p_interval_days * c_hard_mult)::integer);
      return query select 'review'::text, v_ease, v_interval, p_repetitions, p_lapses,
        0, now() + make_interval(days => v_interval);
    else
      v_ease := round(greatest(c_min_ease, p_ease_factor + (case when p_rating = 3 then c_ease_easy else 0 end)), 2);
      v_reps := p_repetitions + 1;
      if v_reps = 1 then v_interval := c_graduating;
      elsif v_reps = 2 then v_interval := c_second;
      else v_interval := round(p_interval_days * v_ease)::integer;
      end if;
      if p_rating = 3 then v_interval := round(v_interval * c_easy_mult)::integer; end if;
      return query select 'review'::text, v_ease, v_interval, v_reps, p_lapses,
        0, now() + make_interval(days => v_interval);
    end if;
  end if;
end;
$$;


--
-- Name: end_study_session(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_study_session(p_user_id uuid, p_session_id bigint) RETURNS TABLE(id bigint, started_at timestamp with time zone, ended_at timestamp with time zone, cards_reviewed integer, cards_correct integer, new_cards_learned integer, duration_seconds integer)
    LANGUAGE sql
    AS $$
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
$$;


--
-- Name: enforce_gmail_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_gmail_email() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
begin
  if TG_OP = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  if new.email !~* '^[^@\s]+@gmail\.com$' then
    raise exception 'Only @gmail.com email addresses are allowed';
  end if;

  return new;
end;
$_$;


--
-- Name: enforce_katakana_requires_hiragana_mastered(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_katakana_requires_hiragana_mastered() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.study_katakana = true and old.study_katakana is distinct from true then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    or not public.reading_test_passed(new.user_id, 'hiragana')
    then
      raise exception 'Finish learning all hiragana and pass the reading test before you can start katakana.';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: evaluate_kana_achievements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_kana_achievements(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: evaluate_kanji_vocab_achievements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_kanji_vocab_achievements(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_admin_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_dashboard_stats() RETURNS TABLE(total_students bigint, new_students_7d bigint, active_today bigint, active_7d bigint, reviews_today bigint, new_leads_7d bigint, leads_uncontacted bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    (select count(*) from public.users where admin = false) as total_students,
    (select count(*) from public.users
       where admin = false and created_at >= now() - interval '7 days') as new_students_7d,
    (select count(*) from public.leaderboard_stats ls join public.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date = current_date) as active_today,
    (select count(*) from public.leaderboard_stats ls join public.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date >= current_date - 6) as active_7d,
    (select coalesce(sum(lds.reviews_count), 0) from public.leaderboard_daily_stats lds join public.users u on u.id = lds.user_id
       where u.admin = false and lds.day = current_date) as reviews_today,
    (select count(*) from public.free_lesson_leads where created_at >= now() - interval '7 days') as new_leads_7d,
    (select count(*) from public.free_lesson_leads where contacted = false) as leads_uncontacted;
$$;


--
-- Name: get_admin_student_roster(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_student_roster() RETURNS TABLE(id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean, created_at timestamp with time zone, current_streak integer, longest_streak integer, last_active_date date, reviews_count bigint, new_cards_count bigint, learned_count bigint, practice_count bigint, test_count bigint, xp_points bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    public.streak_display_count(
      ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
      public.study_day(now(), coalesce(s.timezone, 'UTC'))
    ),
    coalesce(ls.longest_streak, 0), ls.last_active_date,
    coalesce(ls.reviews_count, 0), coalesce(ls.new_cards_count, 0),
    coalesce(learned.cnt, 0), coalesce(practice.cnt, 0), coalesce(ls.test_count, 0),
    coalesce(ls.xp_points, 0)
  from public.users u
  left join public.leaderboard_stats ls on ls.user_id = u.id
  left join public.user_study_settings s on s.user_id = u.id
  left join (
    select user_id, count(*) as cnt from (
      select user_id from public.user_hiragana_progress where graduated_at is not null
      union all
      select user_id from public.user_katakana_progress where graduated_at is not null
    ) g group by user_id
  ) learned on learned.user_id = u.id
  left join (
    select user_id, count(*) as cnt from public.practice_logs group by user_id
  ) practice on practice.user_id = u.id;
$$;


--
-- Name: get_admin_student_streaks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_student_streaks(p_user_id uuid) RETURNS TABLE(current_streak integer, longest_streak integer)
    LANGUAGE sql STABLE
    AS $$
  with tz as (
    select coalesce((select s.timezone from public.user_study_settings s where s.user_id = p_user_id), 'UTC') as name
  )
  select
    coalesce(
      (select public.streak_display_count(
         ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
         public.study_day(now(), (select name from tz))
       )
       from public.leaderboard_stats ls
       where ls.user_id = p_user_id),
      0
    ),
    public.get_review_streak_record(p_user_id, (select name from tz));
$$;


--
-- Name: get_daily_review_budget(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_review_budget(p_user_id uuid, p_timezone text DEFAULT NULL::text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  select greatest(
    coalesce((select s.max_reviews_per_day from public.user_study_settings s where s.user_id = p_user_id), 0)
    - (
      select count(*)
      from public.review_logs l
      cross join public.study_day_bounds(public.resolve_user_timezone(p_user_id, p_timezone)) d
      where l.user_id = p_user_id
        and not l.undone
        and l.status_before in ('review', 'relearning')
        and l.reviewed_at >= d.day_start
        and l.reviewed_at < d.day_end
    ),
    0
  )::integer;
$$;


--
-- Name: get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text DEFAULT NULL::text) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
    LANGUAGE sql STABLE
    AS $$
  with eligible as (
    -- Which progress rows this user is served right now is decided ONLY by get_servable_due_rows
    -- (eligibility from get_eligible_due_rows, plus the daily cap on already-learned cards) -- the
    -- same helper get_today_activity_counts and get_next_due read, so /study's queue and the
    -- dashboard's counts can't disagree. Already bounded to the widest window this function ever
    -- serves (strict due_at <= now(), or the 10-minute learning grace below).
    select e.exercise_type, e.progress_id
    from public.get_servable_due_rows(p_user_id, p_enabled_levels, p_timezone) e
  ),
  candidates as (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      null::bigint as hiragana_id,
      null::bigint as katakana_id,
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::boolean as usually_kana,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_meaning')

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      p.due_at,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      (
        select array_agg(distinct r)
        from (
          select v2.kana_reading as r from public.vocabulary v2 where v2.word = v.word and v2.kana_reading is not null
          union
          select v2.romaji_reading from public.vocabulary v2 where v2.word = v.word and v2.romaji_reading is not null
          union
          select unnest(v2.other_readings) from public.vocabulary v2 where v2.word = v.word
        ) readings
      ) as all_word_readings,
      (
        select array_agg(distinct k2.kanji)
        from public.kanji_word kw2
        join public.kanji k2 on k2.id = kw2.id_kanji
        where kw2.id_word = v.id
          and kw2.id_kanji != p.kanji_id
          and (
            exists (
              select 1
              from public.kanji_word kw3
              join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
              where kw3.id_kanji = kw2.id_kanji
                and kw3.reading_group = kw2.reading_group
                and p3.user_id = p_user_id
                and p3.status = 'review'
                and p3.repetitions >= 2
            )
            or (
              k2.level is not null
              and k.level is not null
              and array_position(array['N5','N4','N3','N2','N1'], k2.level)
                < array_position(array['N5','N4','N3','N2','N1'], k.level)
            )
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_reading')

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      null::bigint, null::bigint,
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas,
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'vocab_meaning')

    union all

    select
      'hiragana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      p.hiragana_id, null::bigint,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      h.drill_enabled,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'hiragana_reading')

    union all

    select
      'katakana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      null::bigint, p.katakana_id,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      k.drill_enabled,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'katakana_reading')
  ),
  -- Whether this user has anything genuinely due right now, across every candidate row above --
  -- the grace window (due_at between now() and now()+10min) only ever applies when this is false.
  has_strict as (
    select exists(select 1 from candidates c where c.due_at <= now()) as strict_exists
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         coalesce(status = 'learning' and drill_enabled, false) as drill_mode,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from candidates, has_strict
  where has_strict.strict_exists = false or candidates.due_at <= now()
  order by candidates.due_at asc
  limit p_limit;
$$;


--
-- Name: get_eligible_due_rows(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[] DEFAULT NULL::text[]) RETURNS TABLE(exercise_type text, progress_id bigint, due_at timestamp with time zone, status text)
    LANGUAGE sql STABLE
    AS $$
  with s as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana,
           coalesce(p_enabled_levels, enabled_levels) as enabled_levels
    from public.user_study_settings
    where user_id = p_user_id
  )
  select 'kanji_meaning'::text, p.id, p.due_at, p.status
  from public.user_kanji_meaning_progress p
  join public.kanji k on k.id = p.kanji_id
  cross join s
  where s.study_track = 'standard'
    and s.study_kanji
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and k.level = any(s.enabled_levels)

  union all

  select 'kanji_reading'::text, p.id, p.due_at, p.status
  from public.user_kanji_reading_progress p
  join public.kanji_word kw on kw.id = p.kanji_word_id
  join public.kanji k on k.id = p.kanji_id
  join public.vocabulary v on v.id = kw.id_word
  cross join s
  where s.study_track = 'standard'
    and s.study_kanji
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and k.level = any(s.enabled_levels)
    and v.study_enabled

  union all

  select 'vocab_meaning'::text, p.id, p.due_at, p.status
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  cross join s
  where s.study_track = 'standard'
    and s.study_vocabulary
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.jlpt_level = any(s.enabled_levels)
    and v.study_enabled

  union all

  select 'hiragana_reading'::text, p.id, p.due_at, p.status
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  cross join s
  where s.study_track = 'kana'
    and s.study_hiragana
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pack_pending

  union all

  select 'katakana_reading'::text, p.id, p.due_at, p.status
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  cross join s
  where s.study_track = 'kana'
    and s.study_katakana
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pack_pending;
$$;


--
-- Name: get_hiragana_reading_cards(uuid, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[]) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
    LANGUAGE sql STABLE
    AS $$
  select
    'hiragana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    p.hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    h.character as kana_character, h.romaji as kana_romaji, h.kana_type, p.drill_streak,
    (p.status = 'learning' and h.drill_enabled) as drill_mode,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$$;


--
-- Name: get_hiragana_rule_forecast(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hiragana_rule_forecast(p_user_id uuid, p_limit integer) RETURNS TABLE(rule_count integer, example_count integer)
    LANGUAGE sql STABLE
    AS $$
  with example_candidates as (
    select h.id, h.sort_order, h.kana_type
    from public.hiragana h
    where h.entry_kind = 'example'
      and h.study_enabled
      and not exists (
        select 1 from public.user_hiragana_progress p
        where p.user_id = p_user_id and p.hiragana_id = h.id
      )
  ),
  row_stats as (
    select kana_type, min(sort_order) as row_sort, count(*) as row_count
    from example_candidates
    group by kana_type
  ),
  row_cum as (
    select kana_type, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  forecast_kana_types as (
    select kana_type, row_count
    from row_cum
    where cum_count - row_count < p_limit
  )
  select
    (
      select count(*)::integer
      from public.hiragana r
      where r.entry_kind = 'rule'
        and r.kana_type in (select kana_type from forecast_kana_types)
        and not exists (
          select 1 from public.user_hiragana_rule_progress up
          where up.user_id = p_user_id and up.hiragana_id = r.id
        )
    ) as rule_count,
    (select coalesce(sum(row_count), 0)::integer from forecast_kana_types) as example_count;
$$;


--
-- Name: get_kanji_detail_words(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_kanji_detail_words(p_kanji_id bigint) RETURNS TABLE(kanji_word_id bigint, reading_group integer, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, furiganas text[], jlpt_level text, usually_kana boolean)
    LANGUAGE sql STABLE
    AS $$
  select kw.id, kw.reading_group, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.other_meanings, v.furiganas, v.jlpt_level, v.usually_kana
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
    and v.study_enabled
  order by kdw.rank;
$$;


--
-- Name: get_kanji_detail_words_batch(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_kanji_detail_words_batch(p_kanji_ids bigint[]) RETURNS TABLE(kanji_id bigint, kanji_word_id bigint, word text, primary_meanings text[], jlpt_level text, usually_kana boolean, furiganas text[])
    LANGUAGE sql STABLE
    AS $$
  select kdw.kanji_id, kw.id, v.word, public.vocabulary_primary_meanings(v), v.jlpt_level, v.usually_kana, v.furiganas
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = any(p_kanji_ids)
    and v.study_enabled
  order by kdw.kanji_id, kdw.rank;
$$;


--
-- Name: get_kanji_intro_cards(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
    LANGUAGE sql STABLE
    AS $$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      null::bigint as hiragana_id,
      null::bigint as katakana_id,
      0 as ord,
      0 as sub_ord,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::boolean as usually_kana,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      1 as ord,
      coalesce(kdw.rank, 0) as sub_ord,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      (
        select array_agg(distinct r)
        from (
          select v2.kana_reading as r from public.vocabulary v2 where v2.word = v.word and v2.kana_reading is not null
          union
          select v2.romaji_reading from public.vocabulary v2 where v2.word = v.word and v2.romaji_reading is not null
          union
          select unnest(v2.other_readings) from public.vocabulary v2 where v2.word = v.word
        ) readings
      ) as all_word_readings,
      (
        select array_agg(distinct k2.kanji)
        from public.kanji_word kw2
        join public.kanji k2 on k2.id = kw2.id_kanji
        where kw2.id_word = v.id
          and kw2.id_kanji != p.kanji_id
          and (
            exists (
              select 1
              from public.kanji_word kw3
              join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
              where kw3.id_kanji = kw2.id_kanji
                and kw3.reading_group = kw2.reading_group
                and p3.user_id = p_user_id
                and p3.status = 'review'
                and p3.repetitions >= 2
            )
            or (
              k2.level is not null
              and k.level is not null
              and array_position(array['N5','N4','N3','N2','N1'], k2.level)
                < array_position(array['N5','N4','N3','N2','N1'], k.level)
            )
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    left join public.kanji_detail_words kdw on kdw.kanji_word_id = kw.id and kdw.kanji_id = p.kanji_id
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'
      and v.study_enabled
  ) cards
  order by ord, sub_ord;
$$;


--
-- Name: get_katakana_reading_cards(uuid, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[]) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
    LANGUAGE sql STABLE
    AS $$
  select
    'katakana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, p.katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    k.character as kana_character, k.romaji as kana_romaji, k.kana_type, p.drill_streak,
    (p.status = 'learning' and k.drill_enabled) as drill_mode,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$$;


--
-- Name: get_katakana_rule_forecast(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_katakana_rule_forecast(p_user_id uuid, p_limit integer) RETURNS TABLE(rule_count integer, example_count integer)
    LANGUAGE sql STABLE
    AS $$
  with example_candidates as (
    select k.id, k.sort_order, k.kana_type
    from public.katakana k
    where k.entry_kind = 'example'
      and k.study_enabled
      and not exists (
        select 1 from public.user_katakana_progress p
        where p.user_id = p_user_id and p.katakana_id = k.id
      )
  ),
  row_stats as (
    select kana_type, min(sort_order) as row_sort, count(*) as row_count
    from example_candidates
    group by kana_type
  ),
  row_cum as (
    select kana_type, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  forecast_kana_types as (
    select kana_type, row_count
    from row_cum
    where cum_count - row_count < p_limit
  )
  select
    (
      select count(*)::integer
      from public.katakana r
      where r.entry_kind = 'rule'
        and r.kana_type in (select kana_type from forecast_kana_types)
        and not exists (
          select 1 from public.user_katakana_rule_progress up
          where up.user_id = p_user_id and up.katakana_id = r.id
        )
    ) as rule_count,
    (select coalesce(sum(row_count), 0)::integer from forecast_kana_types) as example_count;
$$;


--
-- Name: get_leaderboard_new_cards(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
    return query
      with raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(ls.new_cards_count, 0) as score
        from public.users u
        left join public.leaderboard_stats ls on ls.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.new_cards_count) as cnt
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(pt.cnt, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;


--
-- Name: get_leaderboard_reviews(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
    return query
      with raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(ls.reviews_count, 0) as score
        from public.users u
        left join public.leaderboard_stats ls on ls.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.reviews_count) as cnt
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(pt.cnt, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;


--
-- Name: get_leaderboard_streak(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
begin
  return query
    with raw as (
      select
        u.id as user_id,
        u.display_name,
        u.avatar_url,
        u.country,
        u.is_premium,
        u.show_country_on_leaderboard,
        s.leaderboard_anonymous,
        la.adjective,
        la.noun,
        public.streak_display_count(
          ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
          public.study_day(now(), coalesce(s.timezone, 'UTC'))
        )::bigint as score
      from public.users u
      left join public.leaderboard_stats ls on ls.user_id = u.id
      left join public.user_study_settings s on s.user_id = u.id
      left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
      where u.pending_deletion_at is null
    ),
    viewer as (
      select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
    ),
    scored as (
      select
        user_id,
        case when viewer.is_admin then display_name
          when coalesce(leaderboard_anonymous, false)
          then coalesce(adjective || ' ' || noun, 'Anonymous Student')
          else display_name
        end as display_name,
        case when viewer.is_admin then avatar_url
          when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
        case when viewer.is_admin then country
          when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
          then null else country
        end as country,
        case when viewer.is_admin then is_premium
          when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
        score
      from raw
      cross join viewer
    ),
    ranked as (
      select *, rank() over (order by score desc) as rank
      from scored
    )
    select * from ranked
    where rank <= p_limit or user_id = p_viewer_id
    order by rank asc;
end;
$$;


--
-- Name: get_leaderboard_xp(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
    return query
      with raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(ls.xp_points, 0) as score
        from public.users u
        left join public.leaderboard_stats ls on ls.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.xp_points) as points
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
        select
          u.id as user_id,
          u.display_name,
          u.avatar_url,
          u.country,
          u.is_premium,
          u.show_country_on_leaderboard,
          s.leaderboard_anonymous,
          la.adjective,
          la.noun,
          coalesce(pt.points, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
      ),
      viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      ),
      scored as (
        select
          user_id,
          case when viewer.is_admin then display_name
            when coalesce(leaderboard_anonymous, false)
            then coalesce(adjective || ' ' || noun, 'Anonymous Student')
            else display_name
          end as display_name,
          case when viewer.is_admin then avatar_url
            when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
          case when viewer.is_admin then country
            when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
            then null else country
          end as country,
          case when viewer.is_admin then is_premium
            when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
          score
        from raw
        cross join viewer
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from scored
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;


--
-- Name: get_level_progress(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_level_progress(p_user_id uuid, p_level text) RETURNS TABLE(category text, seen bigint, learned bigint, total bigint)
    LANGUAGE sql STABLE
    AS $$
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
       join public.kanji_word kw on kw.id = kdw.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where k.level = p_level and v.study_enabled) as total

  union all

  select 'vocabulary'::text,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level) as seen,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.vocabulary where jlpt_level = p_level and study_enabled) as total

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
    (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'hiragana_' || h.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.hiragana h
  left join public.user_hiragana_progress p
    on p.hiragana_id = h.id and p.user_id = p_user_id
  where h.entry_kind != 'rule' and h.study_enabled
  group by h.kana_type

  union all

  select 'katakana_' || k.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.katakana k
  left join public.user_katakana_progress p
    on p.katakana_id = k.id and p.user_id = p_user_id
  where k.entry_kind != 'rule' and k.study_enabled
  group by k.kana_type;
$$;


--
-- Name: get_new_card_caps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_card_caps() RETURNS TABLE(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
    LANGUAGE sql STABLE
    AS $$
  with totals as (
    select
      (select count(*) from public.kanji) as kanji_total,
      (select count(*) from public.vocabulary where study_enabled) as vocab_total,
      (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as hiragana_total,
      (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as katakana_total
  ),
  -- Kanji and vocab are locked at a 1:6 ratio by sync_new_vocab_per_day_trigger -- deriving
  -- vocab_max as kanji_max * 6 (rather than capping each independently against its own table)
  -- means whichever column that trigger computes from the other always lands within its own
  -- table's real size too.
  kanji as (
    select greatest(least(kanji_total, floor(vocab_total::numeric / 6)::integer), 1) as kanji_max
    from totals
  )
  select
    kanji.kanji_max,
    kanji.kanji_max * 6 as vocab_max,
    greatest(floor(totals.hiragana_total::numeric / 5)::integer * 5, 5) as hiragana_max,
    greatest(floor(totals.katakana_total::numeric / 5)::integer * 5, 5) as katakana_max
  from totals, kanji;
$$;


--
-- Name: get_new_hiragana_candidates(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer) RETURNS TABLE(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text, pack_id integer, kana_type text, base_character text, base_romaji text)
    LANGUAGE sql STABLE
    AS $$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind, h.pack_id, h.kana_type
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.study_enabled
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
  ),
  row_stats as (
    select pack_id, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_id
  ),
  row_cum as (
    select pack_id, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_id
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  ),
  -- dakuten/handakuten gojuon_row -> the seion row it's derived from (see comment above).
  base_rows(row_key, base_row) as (
    values ('ga', 'ka'), ('za', 'sa'), ('da', 'ta'), ('ba', 'ha'), ('pa', 'ha')
  )
  select
    c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id, c.kana_type,
    base."character" as base_character, base.romaji as base_romaji
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  left join base_rows br on br.row_key = c.gojuon_row and c.kana_type in ('dakuten', 'handakuten')
  left join lateral (
    select b."character", b.romaji
    from public.hiragana b
    where b.gojuon_row = br.base_row and b.kana_type = 'seion'
    order by b.sort_order
    -- same 0-based position within its own row that c holds within its own row.
    offset (
      select count(*) from public.hiragana h2
      where h2.gojuon_row = c.gojuon_row and h2.kana_type = c.kana_type and h2.sort_order < c.sort_order
    )
    limit 1
  ) base on true
  order by c.sort_order asc;
$$;


--
-- Name: get_new_hiragana_rule_candidates(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer) RETURNS TABLE(id bigint, "character" text, notes text, kana_type text, sort_order integer, label text, technical_term text, examples jsonb)
    LANGUAGE sql STABLE
    AS $$
  with char_candidates as (
    select h.id, h.sort_order, h.kana_type, h.pack_id as pack_key
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.study_enabled
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
  ),
  row_stats as (
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.pack_key = c.pack_key
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.hiragana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.hiragana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_hiragana_rule_progress up
      where up.user_id = p_user_id and up.hiragana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
    and not exists (
      select 1 from public.hiragana h
      where h.entry_kind != 'rule'
        and h.study_enabled
        and h.sort_order < r.sort_order
        and not exists (select 1 from public.user_hiragana_progress p where p.user_id = p_user_id and p.hiragana_id = h.id)
        -- NEW: an entry_kind='example' row can never use the budget-based about_to_introduce
        -- escape -- it only actually becomes introducible once ITS OWN rule has been seen (see
        -- introduce_hiragana_rule below), which "fits in today's budget" says nothing about.
        and (h.entry_kind = 'example' or not exists (select 1 from about_to_introduce a where a.id = h.id))
    )
    and not exists (
      select 1
      from char_candidates cc
      where cc.kana_type = r.kana_type
        and cc.sort_order = (
          select min(cc2.sort_order) from char_candidates cc2 where cc2.kana_type = r.kana_type
        )
        and not exists (select 1 from about_to_introduce a where a.id = cc.id)
    )
  order by r.sort_order asc;
$$;


--
-- Name: get_new_kanji_basics_candidates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_kanji_basics_candidates(p_user_id uuid) RETURNS TABLE(step smallint)
    LANGUAGE sql STABLE
    AS $$
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
$$;


--
-- Name: get_new_kanji_candidates(uuid, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) RETURNS TABLE(id bigint, kanji text, meanings text[], level text, kun_readings text[], on_readings text[], word_count integer)
    LANGUAGE sql STABLE
    AS $$
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings,
         (select count(*) from public.kanji_detail_words kdw where kdw.kanji_id = k.id)::integer as word_count
  from public.kanji k
  where k.level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_kanji_meaning_progress p
      where p.user_id = p_user_id and p.kanji_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
    )
  order by k.id asc
  limit p_limit;
$$;


--
-- Name: get_new_katakana_candidates(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_katakana_candidates(p_user_id uuid, p_limit integer) RETURNS TABLE(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text, pack_id integer, kana_type text, base_character text, base_romaji text)
    LANGUAGE sql STABLE
    AS $$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind, k.pack_id, k.kana_type
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.study_enabled
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
  ),
  row_stats as (
    select pack_id, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_id
  ),
  row_cum as (
    select pack_id, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_id
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  ),
  base_rows(row_key, base_row) as (
    values ('ga', 'ka'), ('za', 'sa'), ('da', 'ta'), ('ba', 'ha'), ('pa', 'ha')
  )
  select
    c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id, c.kana_type,
    base."character" as base_character, base.romaji as base_romaji
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  left join base_rows br on br.row_key = c.gojuon_row and c.kana_type in ('dakuten', 'handakuten')
  left join lateral (
    select b."character", b.romaji
    from public.katakana b
    where b.gojuon_row = br.base_row and b.kana_type = 'seion'
    order by b.sort_order
    offset (
      select count(*) from public.katakana k2
      where k2.gojuon_row = c.gojuon_row and k2.kana_type = c.kana_type and k2.sort_order < c.sort_order
    )
    limit 1
  ) base on true
  order by c.sort_order asc;
$$;


--
-- Name: get_new_katakana_rule_candidates(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer) RETURNS TABLE(id bigint, "character" text, notes text, kana_type text, sort_order integer, label text, technical_term text, examples jsonb)
    LANGUAGE sql STABLE
    AS $$
  with char_candidates as (
    select k.id, k.sort_order, k.kana_type, k.pack_id as pack_key
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.study_enabled
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
  ),
  row_stats as (
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.pack_key = c.pack_key
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.katakana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.katakana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_katakana_rule_progress up
      where up.user_id = p_user_id and up.katakana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
    and not exists (
      select 1 from public.katakana k
      where k.entry_kind != 'rule'
        and k.study_enabled
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and (k.entry_kind = 'example' or not exists (select 1 from about_to_introduce a where a.id = k.id))
    )
    and not exists (
      select 1
      from char_candidates cc
      where cc.kana_type = r.kana_type
        and cc.sort_order = (
          select min(cc2.sort_order) from char_candidates cc2 where cc2.kana_type = r.kana_type
        )
        and not exists (select 1 from about_to_introduce a where a.id = cc.id)
    )
  order by r.sort_order asc;
$$;


--
-- Name: get_new_vocab_candidates(uuid, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) RETURNS TABLE(id bigint, word text, kana_reading text, primary_meanings text[], parts_of_speech text[], jlpt_level text, usually_kana boolean, furiganas text[])
    LANGUAGE sql STABLE
    AS $$
  select v.id, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and v.study_enabled
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.is_common_jisho desc, v.frequency_number desc nulls last, v.id asc
  limit p_limit;
$$;


--
-- Name: get_next_due(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_due(p_user_id uuid, p_timezone text DEFAULT NULL::text) RETURNS TABLE(next_due_at timestamp with time zone, next_due_is_today boolean, next_due_status text)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_tz text := public.resolve_user_timezone(p_user_id, p_timezone);
  v_next_due_at timestamptz;
  v_next_due_status text;
  v_day_end timestamptz;
  v_budget integer;
begin
  select day_end into v_day_end from public.study_day_bounds(v_tz);
  v_budget := public.get_daily_review_budget(p_user_id, v_tz);

  select t.due_at, t.status into v_next_due_at, v_next_due_status
  from (
    -- Pack cards ('learning'): never limited.
    select r.due_at, r.status
    from public.get_eligible_due_rows(p_user_id) r
    where r.status not in ('review', 'relearning') and r.due_at > now()

    union all

    -- Old cards due later today: only while they still fit in today's remaining budget. Ranked
    -- together with the ones already due (which take the budget first, oldest-due first), the same
    -- order get_servable_due_rows uses.
    select o.due_at, o.status
    from (
      select r.due_at, r.status,
             row_number() over (order by r.due_at, r.exercise_type, r.progress_id) as rn
      from public.get_eligible_due_rows(p_user_id) r
      where r.status in ('review', 'relearning') and r.due_at < v_day_end
    ) o
    where o.due_at > now() and o.rn <= v_budget

    union all

    -- Old cards due from the next study day on: a fresh budget by then.
    select r.due_at, r.status
    from public.get_eligible_due_rows(p_user_id) r
    where r.status in ('review', 'relearning') and r.due_at >= v_day_end
  ) t
  order by t.due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$$;


--
-- Name: get_retention_rate(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_retention_rate(p_user_id uuid, p_window_days integer DEFAULT 30) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  select case when count(*) = 0 then null else avg(correct::int)::numeric end
  from public.review_logs
  where user_id = p_user_id
    and undone = false
    and reviewed_at >= now() - (p_window_days || ' days')::interval;
$$;


--
-- Name: get_review_activity(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_activity(p_user_id uuid, p_timezone text, p_days integer DEFAULT 7) RETURNS TABLE(day date, has_activity boolean, is_free_day boolean)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_today date := public.study_day(now(), p_timezone);
  v_run record;
  v_today_active boolean;
  v_effective_run_start date;
begin
  select * into v_run from public.get_streak_run(p_user_id, p_timezone, v_today - 1);
  select exists(
    select 1 from public.get_streak_active_days(p_user_id, p_timezone) d where d.d = v_today
  ) into v_today_active;

  v_effective_run_start := case
    when v_run.run_start is not null then v_run.run_start
    when v_today_active then v_today
    else null
  end;

  return query
  with days as (
    select generate_series(v_today - (p_days - 1), v_today, interval '1 day')::date as d
  ),
  activity_at as (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
    union all
    select practiced_at from public.practice_logs where user_id = p_user_id
  )
  select
    days.d,
    exists(select 1 from activity_at a where public.study_day(a.at, p_timezone) = days.d),
    (
      days.d < v_today
      and v_effective_run_start is not null
      and days.d >= v_effective_run_start
      and not exists(select 1 from activity_at a where public.study_day(a.at, p_timezone) = days.d)
    )
  from days
  order by days.d asc;
end;
$$;


--
-- Name: get_review_streak(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_streak(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select public.streak_display_count(
       ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
       public.study_day(now(), p_timezone)
     )
     from public.leaderboard_stats ls
     where ls.user_id = p_user_id and ls.user_id = auth.uid()),
    0
  )
$$;


--
-- Name: get_review_streak_record(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_streak_record(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  with grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from public.get_streak_active_days(p_user_id, p_timezone)
  )
  select coalesce(max(run_len), 0)
  from (
    select count(*) as run_len from grp group by grp
  ) runs;
$$;


--
-- Name: get_seen_vocab_meaning_cards(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) RETURNS TABLE(word_id bigint, word text, kana_reading text, furiganas text[], primary_meanings text[], all_primary_word_meanings text[], jlpt_level text, usually_kana boolean)
    LANGUAGE sql STABLE
    AS $$
  select p.word_id, v.word, v.kana_reading, v.furiganas, public.vocabulary_primary_meanings(v),
         public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
         v.jlpt_level, v.usually_kana
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  where p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.study_enabled
    and v.jlpt_level = any(p_enabled_levels);
$$;


--
-- Name: get_servable_due_rows(uuid, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_servable_due_rows(p_user_id uuid, p_enabled_levels text[] DEFAULT NULL::text[], p_timezone text DEFAULT NULL::text) RETURNS TABLE(exercise_type text, progress_id bigint, due_at timestamp with time zone, status text)
    LANGUAGE sql STABLE
    AS $$
  with budget as (
    select public.get_daily_review_budget(p_user_id, p_timezone) as remaining
  ),
  windowed as (
    select r.exercise_type, r.progress_id, r.due_at, r.status,
           r.status in ('review', 'relearning') as is_old
    from public.get_eligible_due_rows(p_user_id, p_enabled_levels) r
    where r.due_at <= now() + interval '10 minutes'
  ),
  ranked as (
    select w.exercise_type, w.progress_id, w.due_at, w.status, w.is_old,
           row_number() over (partition by w.is_old order by w.due_at, w.exercise_type, w.progress_id) as old_rank
    from windowed w
  )
  select k.exercise_type, k.progress_id, k.due_at, k.status
  from ranked k
  cross join budget b
  where not k.is_old or k.old_rank <= b.remaining;
$$;


--
-- Name: get_server_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_server_time() RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$
  select now();
$$;


--
-- Name: get_streak_active_days(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_streak_active_days(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text) RETURNS TABLE(d date)
    LANGUAGE sql STABLE
    AS $$
  select distinct public.study_day(a.at, p_timezone) as d from (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
    union all
    select practiced_at from public.practice_logs where user_id = p_user_id
  ) a;
$$;


--
-- Name: get_streak_run(uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_streak_run(p_user_id uuid, p_timezone text, p_as_of date) RETURNS TABLE(active_count integer, run_start date, recent_inactive date[], max_active_count integer)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  rec record;
  v_run_start date := null;
  v_active_count integer := 0;
  v_recent date[] := '{}';
  v_max_active_count integer := 0;
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
begin
  for rec in
    with active as (
      select d from public.get_streak_active_days(p_user_id, p_timezone) where d <= p_as_of
    ),
    bounds as (
      select min(d) as first_day from active
    ),
    days as (
      select generate_series(bounds.first_day, p_as_of, interval '1 day')::date as day
      from bounds
      where bounds.first_day is not null
    )
    select days.day, (active.d is not null) as is_active
    from days
    left join active on active.d = days.day
    order by days.day asc
  loop
    if v_run_start is not null then
      v_recent := array(select x from unnest(v_recent) x where x > rec.day - v_window_days);
    end if;

    if rec.is_active then
      if v_run_start is null then
        v_run_start := rec.day;
        v_active_count := 1;
        v_recent := '{}';
      else
        v_active_count := v_active_count + 1;
      end if;
      v_max_active_count := greatest(v_max_active_count, v_active_count);
    else
      if v_run_start is not null then
        v_recent := v_recent || rec.day;
        if array_length(v_recent, 1) > v_free_limit then
          v_run_start := null;
          v_active_count := 0;
          v_recent := '{}';
        end if;
      end if;
    end if;
  end loop;

  active_count := v_active_count;
  run_start := v_run_start;
  recent_inactive := v_recent;
  max_active_count := v_max_active_count;
  return next;
end;
$$;


--
-- Name: get_student_daily_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_daily_activity(p_user_id uuid) RETURNS TABLE(day date, reviews_count integer, new_cards_count integer, learned_count integer, practice_count integer, test_count integer, xp_points integer)
    LANGUAGE sql STABLE
    AS $$
  with tz as (
    select coalesce((select timezone from public.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  base as (
    select lds.day, lds.reviews_count, lds.new_cards_count, lds.test_count, lds.xp_points
    from public.leaderboard_daily_stats lds
    where lds.user_id = p_user_id
  ),
  learned as (
    select public.study_day(g.graduated_at, (select tz from tz)) as day, count(*)::integer as learned_count
    from (
      select graduated_at from public.user_hiragana_progress where user_id = p_user_id and graduated_at is not null
      union all
      select graduated_at from public.user_katakana_progress where user_id = p_user_id and graduated_at is not null
    ) g
    group by 1
  ),
  practice as (
    select public.study_day(pl.practiced_at, (select tz from tz)) as day, count(*)::integer as practice_count
    from public.practice_logs pl
    where pl.user_id = p_user_id
    group by 1
  ),
  days as (
    select day from base
    union select day from learned
    union select day from practice
  )
  select
    d.day,
    coalesce(b.reviews_count, 0),
    coalesce(b.new_cards_count, 0),
    coalesce(l.learned_count, 0),
    coalesce(p.practice_count, 0),
    coalesce(b.test_count, 0),
    coalesce(b.xp_points, 0)
  from days d
  left join base b on b.day = d.day
  left join learned l on l.day = d.day
  left join practice p on p.day = d.day
  order by d.day desc;
$$;


--
-- Name: get_student_new_card_progress(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_new_card_progress(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  with tz as (
    select coalesce((select timezone from public.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  intros as (
    select 'kanji'::text as category, k.level as level, public.study_day(p.created_at, (select tz from tz)) as day
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
    union all
    select 'vocabulary', v.jlpt_level, public.study_day(p.created_at, (select tz from tz))
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
    union all
    select 'hiragana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from public.user_hiragana_progress p
    where p.user_id = p_user_id
    union all
    select 'katakana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from public.user_katakana_progress p
    where p.user_id = p_user_id
  ),
  history as (
    select day, category, level, count(*)::integer as n
    from intros
    group by day, category, level
  ),
  pool as (
    select 'kanji'::text as category, k.level as level, count(*)::integer as total
    from public.kanji k
    group by k.level
    union all
    select 'vocabulary', v.jlpt_level, count(*)::integer
    from public.vocabulary v
    where v.study_enabled and v.jlpt_level is not null
    group by v.jlpt_level
    union all
    select 'hiragana_reading', null, count(*)::integer
    from public.hiragana h
    where h.entry_kind != 'rule' and h.study_enabled
    union all
    select 'katakana_reading', null, count(*)::integer
    from public.katakana k
    where k.entry_kind != 'rule' and k.study_enabled
  ),
  tests as (
    select public.study_day(ts.earned_at, (select tz from tz)) as day, ts.test_type, ts.attempt_number, ts.percent
    from public.test_status ts
    where ts.user_id = p_user_id and ts.test_type in ('hiragana', 'katakana')
  )
  select jsonb_build_object(
    'timezone', (select tz from tz),
    'join_day', (select public.study_day(u.created_at, (select tz from tz)) from public.users u where u.id = p_user_id),
    'today', public.study_day(now(), (select tz from tz)),
    'counter_total', (
      select coalesce(sum(lds.new_cards_count), 0)::integer
      from public.leaderboard_daily_stats lds
      where lds.user_id = p_user_id
    ),
    'history', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', h.day, 'category', h.category, 'level', h.level, 'count', h.n)
                  order by h.day, h.category, h.level),
        '[]'::jsonb)
      from history h
    ),
    'pool', (
      select coalesce(
        jsonb_agg(jsonb_build_object('category', p.category, 'level', p.level, 'total', p.total)
                  order by p.category, p.level),
        '[]'::jsonb)
      from pool p
    ),
    'tests', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', t.day, 'test_type', t.test_type,
                                     'attempt_number', t.attempt_number, 'percent', t.percent)
                  order by t.day, t.attempt_number),
        '[]'::jsonb)
      from tests t
    )
  );
$$;


--
-- Name: get_today_activity_counts(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_today_activity_counts(p_user_id uuid, p_timezone text DEFAULT NULL::text) RETURNS TABLE(due_today integer, due_learning integer, reviewed_today integer, new_kanji_today integer, new_vocab_today integer, new_hiragana_today integer, new_katakana_today integer)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_tz text := public.resolve_user_timezone(p_user_id, p_timezone);
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_due_today integer;
  v_due_learning integer;
begin
  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(v_tz);

  -- get_servable_due_rows is already bounded to the due window; this WHERE just keeps the
  -- strictly-due rows.
  select count(*), count(*) filter (where r.status in ('learning', 'relearning'))
  into v_due_today, v_due_learning
  from public.get_servable_due_rows(p_user_id, null, v_tz) r
  where r.due_at <= now();

  -- Nothing genuinely due right now: fall back to learning/relearning rows resurfacing within
  -- their maximum possible wait (10 minutes -- LEARNING_STEPS_MINUTES), so this agrees with
  -- get_due_cards' own fallback instead of telling a caught-up student to keep waiting for a card
  -- /study would already hand them. Every row counted here is learning/relearning by
  -- construction, so it becomes both due_today and due_learning outright.
  if v_due_today = 0 then
    select count(*) into v_due_today
    from public.get_servable_due_rows(p_user_id, null, v_tz) r
    where r.status in ('learning', 'relearning') and r.due_at <= now() + interval '10 minutes';
    v_due_learning := v_due_today;
  end if;

  return query
  select
    v_due_today::integer,
    v_due_learning::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$$;


--
-- Name: get_vocab_meaning_pool(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vocab_meaning_pool(p_word text, p_kana_reading text) RETURNS text[]
    LANGUAGE sql STABLE
    AS $$
  select array_agg(distinct m)
  from (
    select unnest(public.vocabulary_primary_meanings(v)) as m
    from public.vocabulary v
    where v.word = p_word
      and v.kana_reading is not distinct from p_kana_reading

    union

    select om.gloss
    from public.vocabulary v
    cross join lateral jsonb_array_elements(coalesce(v.other_meanings, '[]'::jsonb)) as sense(value)
    cross join lateral jsonb_array_elements_text(sense.value) as om(gloss)
    where v.word = p_word
      and v.kana_reading is not distinct from p_kana_reading
  ) pool;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'full_name', 'User Nou'), 50),
    new.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_study_settings (user_id)
  VALUES (new.id);

  INSERT INTO public.leaderboard_stats (user_id)
  VALUES (new.id);

  RETURN new;
END;
$$;


--
-- Name: handle_public_user_profile_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_public_user_profile_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', new.display_name)
      || jsonb_build_object('avatar_url', new.avatar_url)
  where id = new.id
    and (
      raw_user_meta_data->>'full_name' is distinct from new.display_name
      or raw_user_meta_data->>'avatar_url' is distinct from new.avatar_url
    );
  return new;
end;
$$;


--
-- Name: handle_user_email_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_email_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF new.email IS DISTINCT FROM old.email THEN
    UPDATE public.users
    SET email = new.email, updated_at = now()
    WHERE id = new.id;
  END IF;
  RETURN new;
END;
$$;


--
-- Name: handle_user_metadata_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_metadata_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_full_name text := left(new.raw_user_meta_data->>'full_name', 50);
  v_avatar_url text := new.raw_user_meta_data->>'avatar_url';
begin
  update public.users
  set
    display_name = coalesce(display_name, nullif(v_full_name, '')),
    avatar_url = coalesce(avatar_url, v_avatar_url),
    updated_at = now()
  where id = new.id
    and (
      (display_name is null and nullif(v_full_name, '') is not null)
      or (avatar_url is null and v_avatar_url is distinct from avatar_url)
    );
  return new;
end;
$$;


--
-- Name: hiragana_auto_activate_katakana(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hiragana_auto_activate_katakana() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'review' and old.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    and public.reading_test_passed(new.user_id, 'hiragana')
    then
      update public.user_study_settings
      set study_katakana = true
      where user_id = new.user_id and study_track = 'kana' and study_katakana = false;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: hiragana_regression_disables_katakana(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hiragana_regression_disables_katakana() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: immutable_array_to_string(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_array_to_string(text[]) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$ select array_to_string($1, ' ') $_$;


--
-- Name: introduce_hiragana(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(pack_completed boolean, hiragana_ids bigint[])
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pack_id integer;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_hiragana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select pack_id into v_pack_id from public.hiragana where id = p_hiragana_id;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    -- Over the cap already -- still allow this one if it's finishing a pack (another
    -- character sharing this pack_id) that was already started today, rather than starting a
    -- fresh pack once the cap is spent.
    if not exists (
      select 1
      from public.user_hiragana_progress p
      join public.hiragana h on h.id = p.hiragana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and h.pack_id = v_pack_id
    ) then
      raise exception 'Daily new hiragana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.hiragana
  where pack_id = v_pack_id and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  where p.user_id = p_user_id
    and h.pack_id = v_pack_id
    and h.entry_kind = 'character'
    and h.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_hiragana_progress p
    set pack_pending = false, due_at = now()
    from public.hiragana h
    where p.hiragana_id = h.id
      and p.user_id = p_user_id
      and h.pack_id = v_pack_id
      and h.entry_kind = 'character'
      and h.study_enabled;

    select array_agg(h.id order by h.sort_order) into v_ids
    from public.hiragana h
    where h.pack_id = v_pack_id and h.entry_kind = 'character' and h.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$$;


--
-- Name: introduce_hiragana_examples(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_hiragana_examples(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(hiragana_id bigint)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_hiragana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_hiragana_candidates(p_user_id, v_remaining) c
  join public.hiragana h on h.id = c.id
  where c.entry_kind = 'example'
    -- NEW: the example's own rule card must already be recorded as seen.
    and exists (
      select 1
      from public.user_hiragana_rule_progress rp
      join public.hiragana r on r.id = rp.hiragana_id
      where rp.user_id = p_user_id and r.kana_type = h.kana_type
    )
  on conflict (user_id, hiragana_id) do nothing
  returning user_hiragana_progress.hiragana_id;
end;
$$;


--
-- Name: introduce_hiragana_rule(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(hiragana_ids bigint[])
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_kana_type text;
  v_ids bigint[];
begin
  -- Same advisory lock namespace introduce_hiragana/introduce_hiragana_examples already use for
  -- this user -- this function now also inserts into user_hiragana_progress and counts today's
  -- cap usage, so it needs the same serialization they rely on.
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_hiragana_rule_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana rule has already been introduced' using errcode = 'P0002';
  end if;

  select kana_type into v_kana_type from public.hiragana where id = p_hiragana_id;

  insert into public.user_hiragana_rule_progress (user_id, hiragana_id, session_id)
  values (p_user_id, p_hiragana_id, p_session_id);

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  select new_hiragana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(coalesce(v_cap, 0) - v_count, 0);

  -- Atomically introduce this rule's own example pack too (seion/dakuten/handakuten have none --
  -- this simply matches/inserts zero rows for those, same as before this migration). Whatever
  -- doesn't fit v_remaining is left for introduce_hiragana_examples to pick up on a later day,
  -- same fallback as always.
  with inserted as (
    insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
    select p_user_id, h.id, p_session_id, 'learning', now()
    from public.hiragana h
    where h.kana_type = v_kana_type
      and h.entry_kind = 'example'
      and h.study_enabled
      and not exists (
        select 1 from public.user_hiragana_progress p
        where p.user_id = p_user_id and p.hiragana_id = h.id
      )
    order by h.sort_order
    limit v_remaining
    on conflict (user_id, hiragana_id) do nothing
    returning hiragana_id
  )
  select array_agg(i.hiragana_id order by h.sort_order) into v_ids
  from inserted i join public.hiragana h on h.id = i.hiragana_id;

  return query select v_ids;
end;
$$;


--
-- Name: introduce_kanji(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_kanji:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
  ) then
    raise exception 'Kanji study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_kanji_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_kanji_meaning_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new kanji limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_kanji_meaning_progress
    where user_id = p_user_id and kanji_id = p_kanji_id
  ) then
    raise exception 'This kanji has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_kanji_meaning_progress (user_id, kanji_id, session_id, status, due_at)
  values (p_user_id, p_kanji_id, p_session_id, 'learning', now());

  insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
  select p_user_id, p_kanji_id, kw.kanji_word_id, 'learning', now()
  from public.get_kanji_detail_words(p_kanji_id) kw;
end;
$$;


--
-- Name: introduce_kanji_basics(uuid, smallint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: introduce_katakana(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(pack_completed boolean, katakana_ids bigint[])
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pack_id integer;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_katakana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select pack_id into v_pack_id from public.katakana where id = p_katakana_id;

  select count(*) into v_count
  from public.user_katakana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    -- Same pack-completion carve-out as introduce_hiragana above.
    if not exists (
      select 1
      from public.user_katakana_progress p
      join public.katakana k on k.id = p.katakana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and k.pack_id = v_pack_id
    ) then
      raise exception 'Daily new katakana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.katakana
  where pack_id = v_pack_id and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  where p.user_id = p_user_id
    and k.pack_id = v_pack_id
    and k.entry_kind = 'character'
    and k.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_katakana_progress p
    set pack_pending = false, due_at = now()
    from public.katakana k
    where p.katakana_id = k.id
      and p.user_id = p_user_id
      and k.pack_id = v_pack_id
      and k.entry_kind = 'character'
      and k.study_enabled;

    select array_agg(k.id order by k.sort_order) into v_ids
    from public.katakana k
    where k.pack_id = v_pack_id and k.entry_kind = 'character' and k.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$$;


--
-- Name: introduce_katakana_examples(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_katakana_examples(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(katakana_id bigint)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_katakana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_katakana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_katakana_candidates(p_user_id, v_remaining) c
  join public.katakana k on k.id = c.id
  where c.entry_kind = 'example'
    and exists (
      select 1
      from public.user_katakana_rule_progress rp
      join public.katakana r on r.id = rp.katakana_id
      where rp.user_id = p_user_id and r.kana_type = k.kana_type
    )
  on conflict (user_id, katakana_id) do nothing
  returning user_katakana_progress.katakana_id;
end;
$$;


--
-- Name: introduce_katakana_rule(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(katakana_ids bigint[])
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_kana_type text;
  v_ids bigint[];
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_katakana_rule_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana rule has already been introduced' using errcode = 'P0002';
  end if;

  select kana_type into v_kana_type from public.katakana where id = p_katakana_id;

  insert into public.user_katakana_rule_progress (user_id, katakana_id, session_id)
  values (p_user_id, p_katakana_id, p_session_id);

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  select new_katakana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  select count(*) into v_count
  from public.user_katakana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(coalesce(v_cap, 0) - v_count, 0);

  with inserted as (
    insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
    select p_user_id, k.id, p_session_id, 'learning', now()
    from public.katakana k
    where k.kana_type = v_kana_type
      and k.entry_kind = 'example'
      and k.study_enabled
      and not exists (
        select 1 from public.user_katakana_progress p
        where p.user_id = p_user_id and p.katakana_id = k.id
      )
    order by k.sort_order
    limit v_remaining
    on conflict (user_id, katakana_id) do nothing
    returning katakana_id
  )
  select array_agg(i.katakana_id order by k.sort_order) into v_ids
  from inserted i join public.katakana k on k.id = i.katakana_id;

  return query select v_ids;
end;
$$;


--
-- Name: introduce_vocabulary(uuid, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text DEFAULT 'UTC'::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_vocabulary:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
  ) then
    raise exception 'Vocabulary study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_vocab_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_vocabulary_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new word limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_vocabulary_progress
    where user_id = p_user_id and word_id = p_word_id
  ) then
    raise exception 'This word has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_vocabulary_progress (user_id, word_id, session_id, status, due_at, pending_batch)
  values (p_user_id, p_word_id, p_session_id, 'learning', now() + interval '1 minute', true);
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select admin from public.users where id = auth.uid()), false);
$$;


--
-- Name: kanji_vocab_progress_updates_achievements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kanji_vocab_progress_updates_achievements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.evaluate_kanji_vocab_achievements(new.user_id);
  return new;
end;
$$;


--
-- Name: katakana_auto_activate_standard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.katakana_auto_activate_standard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    and public.reading_test_passed(new.user_id, 'katakana')
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
$$;


--
-- Name: leaderboard_bump_streak(integer, date, date[], date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_bump_streak(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_day date) RETURNS TABLE(streak integer, recent_inactive date[])
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_streak integer;
  v_recent date[] := coalesce(p_recent_inactive, '{}');
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
  d date;
begin
  if p_last_active_date is null then
    streak := 1;
    recent_inactive := '{}';
    return next;
    return;
  end if;

  if p_day <= p_last_active_date then
    -- Same day (a second activity today), or a non-chronological write -- state unchanged.
    streak := coalesce(p_current_streak, 1);
    recent_inactive := v_recent;
    return next;
    return;
  end if;

  v_streak := coalesce(p_current_streak, 1);

  for d in select generate_series(p_last_active_date + 1, p_day - 1, interval '1 day')::date loop
    v_recent := array(select x from unnest(v_recent) x where x > d - v_window_days);
    v_recent := v_recent || d;
    if array_length(v_recent, 1) > v_free_limit then
      v_streak := 0;
      v_recent := '{}';
      exit;
    end if;
  end loop;

  if v_streak = 0 then
    streak := 1;
    recent_inactive := '{}';
  else
    v_recent := array(select x from unnest(v_recent) x where x > p_day - v_window_days);
    streak := v_streak + 1;
    recent_inactive := v_recent;
  end if;
  return next;
end;
$$;


--
-- Name: leaderboard_period_end(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_period_end(p_period text, p_timezone text DEFAULT NULL::text) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$
  with tz as (
    select public.resolve_user_timezone(auth.uid(), p_timezone) as name
  ),
  today as (
    select tz.name, public.study_day(now(), tz.name) as d from tz
  )
  select case
    when p_period not in ('daily', 'weekly', 'monthly', 'yearly') then null
    else (
      (case p_period
         when 'daily' then t.d + 1
         when 'weekly' then (public.leaderboard_period_start('weekly', t.d) + 7)
         when 'monthly' then (public.leaderboard_period_start('monthly', t.d) + interval '1 month')::date
         when 'yearly' then (public.leaderboard_period_start('yearly', t.d) + interval '1 year')::date
       end)::timestamp + interval '6 hours'
    ) at time zone t.name
  end
  from today t;
$$;


--
-- Name: leaderboard_period_start(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_period_start(p_period text, p_today date) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_period
    when 'daily' then p_today
    when 'weekly' then date_trunc('week', p_today::timestamp)::date
    when 'monthly' then date_trunc('month', p_today::timestamp)::date
    when 'yearly' then date_trunc('year', p_today::timestamp)::date
  end;
$$;


--
-- Name: leaderboard_stats_on_drill(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_drill() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.last_drilled_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_new_card(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_new_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.created_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, 25, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_new_rule_card(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_new_rule_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.seen_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, 25, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_practice_answer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_practice_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.practiced_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, v_xp, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points)
  values (new.user_id, v_day, v_xp)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp;

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_reading_test(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_reading_test() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 25 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.attempted_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, test_count, current_streak, longest_streak, last_active_date)
  values (new.user_id, v_xp, 1, 1, 1, v_day)
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      test_count = ls.test_count + 1,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points, test_count)
  values (new.user_id, v_day, v_xp, 1)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp,
      test_count = lds.test_count + 1;

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_review_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_review_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.reviewed_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, reviews_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, v_xp, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set reviews_count = ls.reviews_count + 1,
      xp_points = ls.xp_points + v_xp,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, reviews_count, xp_points)
  values (new.user_id, v_day, 1, v_xp)
  on conflict (user_id, day) do update
  set reviews_count = lds.reviews_count + 1,
      xp_points = lds.xp_points + v_xp;

  return new;
end;
$$;


--
-- Name: leaderboard_stats_on_review_undo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leaderboard_stats_on_review_undo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when old.correct then 10 else 2 end;
  v_last_active date;
  v_run record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = old.user_id;
  v_day := public.study_day(old.reviewed_at, coalesce(v_tz, 'UTC'));

  select max(d) into v_last_active
  from public.get_streak_active_days(old.user_id, coalesce(v_tz, 'UTC'));

  select * into v_run
  from public.get_streak_run(old.user_id, coalesce(v_tz, 'UTC'), v_last_active);

  update public.leaderboard_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0),
      current_streak = coalesce(v_run.active_count, 0),
      last_active_date = v_last_active,
      streak_recent_inactive = coalesce(v_run.recent_inactive, '{}'),
      updated_at = now()
  where user_id = old.user_id;

  update public.leaderboard_daily_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0)
  where user_id = old.user_id and day = v_day;

  return new;
end;
$$;


--
-- Name: normalize_enabled_levels(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_enabled_levels() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_order text[] := array['N5','N4','N3','N2','N1'];
  v_max_idx int := 0;
  v_min_idx int := 6;
  v_level text;
  v_idx int;
begin
  if new.enabled_levels is null then
    return new;
  end if;

  foreach v_level in array new.enabled_levels loop
    v_idx := array_position(v_order, v_level);
    if v_idx is null then
      raise exception 'Invalid JLPT level in enabled_levels: %', v_level;
    end if;
    v_max_idx := greatest(v_max_idx, v_idx);
    v_min_idx := least(v_min_idx, v_idx);
  end loop;

  if v_max_idx = 0 then
    raise exception 'enabled_levels must contain at least one JLPT level';
  end if;

  if new.include_lower_levels then
    new.enabled_levels := v_order[v_min_idx:v_max_idx];
  else
    new.enabled_levels := array[v_order[v_max_idx]];
  end if;

  return new;
end;
$$;


--
-- Name: reading_test_advance_queue(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare
  v_position int4;
begin
  insert into public.user_reading_test_attempts (user_id, test_type, queue_position)
  values (p_user_id, p_test_type, p_position)
  on conflict (user_id, test_type) do update
  set queue_position = greatest(public.user_reading_test_attempts.queue_position, excluded.queue_position)
  returning queue_position into v_position;
  return v_position;
end;
$$;


--
-- Name: reading_test_cta_state(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_cta_state(p_user_id uuid, p_test_type text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_total int;
  v_answered int;
  v_attempt_number int;
  v_retry_started_at timestamptz;
  v_answered_since_retry int;
begin
  select count(*) into v_total from public.test where test_type = p_test_type;

  select count(*) into v_answered from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type;

  if v_answered = 0 then
    return 'not_started';
  end if;

  select attempt_number, updated_at into v_attempt_number, v_retry_started_at
  from public.user_reading_test_attempts
  where user_id = p_user_id and test_type = p_test_type;

  -- Never retried yet (no row, or attempt_number still 1) -- still on, or just finished, the
  -- first pass. A row can now exist without ever having retried -- reading_test_ensure_queue
  -- (20261106_reading_test_resume_state.sql) creates it to store the first pass's queue too -- so
  -- attempt_number, not row/updated_at presence, is what actually distinguishes "retried" from
  -- "just resumed".
  if v_attempt_number is null or v_attempt_number <= 1 then
    return case when v_answered < v_total then 'in_progress' else 'retry_pending' end;
  end if;

  select count(*) into v_answered_since_retry
  from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and attempted_at > v_retry_started_at;

  -- Retried at least once, but nothing answered since -- ready to retry, not mid-retry (also
  -- where a fully-completed retry pass lands, looping back for the next round if still not passed).
  if v_answered_since_retry = 0 or v_answered >= v_total then
    return 'retry_pending';
  end if;

  return 'retry_in_progress';
end;
$$;


--
-- Name: reading_test_current_attempt(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_current_attempt(p_user_id uuid, p_test_type text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    (select attempt_number from public.user_reading_test_attempts
     where user_id = p_user_id and test_type = p_test_type),
    1
  );
$$;


--
-- Name: reading_test_ensure_queue(uuid, text, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[]) RETURNS bigint[]
    LANGUAGE plpgsql
    AS $$
declare
  v_queue bigint[];
begin
  insert into public.user_reading_test_attempts (user_id, test_type, queue_order)
  values (p_user_id, p_test_type, p_queue)
  on conflict (user_id, test_type) do update
  set queue_order = coalesce(public.user_reading_test_attempts.queue_order, excluded.queue_order)
  returning queue_order into v_queue;
  return v_queue;
end;
$$;


--
-- Name: reading_test_passed(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_passed(p_user_id uuid, p_test_type text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select
    (select count(*) from public.test where test_type = p_test_type) > 0
    and (select count(*) from public.test where test_type = p_test_type)
        <= (select count(*) from public.user_reading_test_progress
            where user_id = p_user_id and test_type = p_test_type and correct);
$$;


--
-- Name: reading_test_progress_activates_katakana(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_progress_activates_katakana() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.test_type = 'hiragana' and public.reading_test_passed(new.user_id, 'hiragana') then
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
$$;


--
-- Name: reading_test_progress_activates_standard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_progress_activates_standard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.test_type = 'katakana' and public.reading_test_passed(new.user_id, 'katakana') then
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
$$;


--
-- Name: reading_test_progress_updates_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_progress_updates_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_total int;
  v_answered int;
  v_correct int;
  v_percent int;
begin
  select count(*) into v_total from public.test where test_type = new.test_type;
  select count(*), count(*) filter (where correct) into v_answered, v_correct
    from public.user_reading_test_progress
    where user_id = new.user_id and test_type = new.test_type;

  if v_total = 0 or v_answered < v_total then
    return new;
  end if;

  v_percent := round(v_correct * 100.0 / v_total)::int;

  insert into public.test_status (user_id, test_type, attempt_number, percent, earned_at, updated_at)
  values (
    new.user_id,
    new.test_type,
    public.reading_test_current_attempt(new.user_id, new.test_type),
    v_percent,
    now(),
    now()
  )
  on conflict (user_id, test_type) do update
  set attempt_number = excluded.attempt_number,
      percent = excluded.percent,
      updated_at = now();

  perform public.award_achievement(new.user_id, new.test_type || '_test');
  if v_percent >= 100 then
    perform public.award_achievement(new.user_id, new.test_type || '_test_100');
  end if;

  return new;
end;
$$;


--
-- Name: reading_test_retry_wrong(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_retry_wrong(p_user_id uuid, p_test_type text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  delete from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and correct = false;

  insert into public.user_reading_test_attempts (user_id, test_type, attempt_number, updated_at)
  values (p_user_id, p_test_type, 2, now())
  on conflict (user_id, test_type) do update
  set attempt_number = public.user_reading_test_attempts.attempt_number + 1,
      updated_at = now(),
      queue_order = null,
      queue_position = 0,
      draft_sentence_id = null,
      draft_answer = '',
      draft_updated_at = null;
end;
$$;


--
-- Name: reading_test_submit_answer(uuid, text, bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_submit_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint, p_correct boolean, p_user_answer text) RETURNS TABLE(correct boolean, user_answer text)
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.user_reading_test_progress (user_id, test_type, sentence_id, correct, user_answer, attempted_at)
  values (p_user_id, p_test_type, p_sentence_id, p_correct, p_user_answer, now())
  on conflict (user_id, sentence_id) do nothing;

  return query
  select p.correct, p.user_answer
  from public.user_reading_test_progress p
  where p.user_id = p_user_id and p.sentence_id = p_sentence_id;
end;
$$;


--
-- Name: reading_test_undo_answer(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  delete from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and sentence_id = p_sentence_id;
end;
$$;


--
-- Name: rebuild_kanji_detail_words(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_kanji_detail_words() RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  truncate table public.kanji_detail_words;

  insert into public.kanji_detail_words (kanji_id, kanji_word_id, rank)
  with params as (
    select array['N5', 'N4', 'N3', 'N2', 'N1']::text[] as v_order
  ),
  kanji_rank as (
    select k.id as kanji_id,
           coalesce(array_position(p.v_order, k.level), 6) as lvl_rank
    from public.kanji k
    cross join params p
  ),
  scored_all as (
    select
      kw.id_kanji as kanji_id,
      kw.id as kanji_word_id,
      kw.reading_group,
      v.word,
      coalesce(v.frequency_number, 0) as freq_score,
      v.is_common_jisho as is_common,
      case when wr.word_rank <= kr.lvl_rank then 1 else 2 end as tier,
      greatest(wr.word_rank - kr.lvl_rank, 0) as level_gap,
      (v.usually_kana is true) as is_uk
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word and v.study_enabled
    cross join params p
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select coalesce(array_position(p.v_order, v.jlpt_level), 6) as word_rank
    ) wr
  ),
  non_uk_kanji as (
    select distinct kanji_id from scored_all where not is_uk
  ),
  scored as (
    -- usually_kana words are left out, unless the kanji has no other candidate at all: then its own
    -- usually_kana words are used, so it still gets example words / Word reading cards.
    select s.kanji_id, s.kanji_word_id, s.reading_group, s.word, s.freq_score, s.is_common, s.tier, s.level_gap
    from scored_all s
    where not s.is_uk
       or not exists (select 1 from non_uk_kanji n where n.kanji_id = s.kanji_id)
  ),
  deduped as (
    select distinct on (kanji_id, word)
      kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score
    from scored
    order by kanji_id, word, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
  ),
  group_sizes as (
    select kanji_id, reading_group, count(*) as group_size
    from deduped
    group by kanji_id, reading_group
  ),
  group_rank as (
    select
      kanji_id, reading_group, group_size,
      row_number() over (
        partition by kanji_id
        order by group_size desc, reading_group asc nulls last
      ) as size_rank
    from group_sizes
  ),
  selected_groups as (
    -- A group is "big enough" to contribute its own champion when it's
    -- among the kanji's 3 largest groups, or when it has >=2 words outright (not for a kanji falling back to its usually_kana words)
    -- (so kanji with more than 3 genuinely big groups still keep all of them).
    select kanji_id, reading_group
    from group_rank
    where size_rank <= 3
       or (group_size >= 2 and exists (select 1 from non_uk_kanji n where n.kanji_id = group_rank.kanji_id))
  ),
  group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.is_common, s.freq_score
    from deduped s
    join selected_groups sg
      on sg.kanji_id = s.kanji_id
     and sg.reading_group is not distinct from s.reading_group
    order by s.kanji_id, s.reading_group nulls last, s.tier asc, s.level_gap asc, s.is_common desc, s.freq_score desc, s.kanji_word_id asc
  ),
  champion_count as (
    select kanji_id, count(*) as n from group_champions group by kanji_id
  ),
  ranked_fill_ins as (
    select
      s.*,
      row_number() over (
        partition by s.kanji_id
        order by s.reading_group nulls last, s.tier asc, s.level_gap asc, s.is_common desc, s.freq_score desc, s.kanji_word_id asc
      ) as rn
    from deduped s
    where not exists (
      select 1 from group_champions c
      where c.kanji_word_id = s.kanji_word_id and c.kanji_id = s.kanji_id
    )
  ),
  fill_ins as (
    -- Only kicks in when the kanji doesn't have 3 distinct reading_groups to
    -- begin with (fewer than 3 groups were selected above) -- same
    -- leftover-candidate fallback as before, now against group_champions
    -- instead of best_per_group.
    select
      r.kanji_id, r.kanji_word_id, r.reading_group, r.tier, r.level_gap, r.is_common, r.freq_score
    from ranked_fill_ins r
    join champion_count cc on cc.kanji_id = r.kanji_id
    where cc.n < 3
      and r.rn <= (3 - cc.n)
  ),
  combined as (
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score from group_champions
    union all
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score from fill_ins
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
    ) as rank
  from combined;
end;
$$;


--
-- Name: record_hiragana_drill_result(uuid, bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text DEFAULT 'UTC'::text) RETURNS TABLE(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
    LANGUAGE plpgsql
    AS $$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
begin
  select * into v_current from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id;

  if v_current is null then
    raise exception 'No progress found for this hiragana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This hiragana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_hiragana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_hiragana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), graduated_at = now(), updated_at = now()
    where id = v_current.id;
    -- The status='review' update above fires user_hiragana_progress_updates_achievements_trigger
    -- synchronously (AFTER UPDATE triggers complete before control returns here), so any
    -- newly-earned rows are already visible with earned_at >= v_before_ts (user_achievements.
    -- earned_at defaults to now(), which -- like v_before_ts -- is transaction-start-constant).
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_hiragana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$$;


--
-- Name: record_katakana_drill_result(uuid, bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text DEFAULT 'UTC'::text) RETURNS TABLE(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
    LANGUAGE plpgsql
    AS $$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
begin
  select * into v_current from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id;

  if v_current is null then
    raise exception 'No progress found for this katakana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This katakana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_katakana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_katakana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), graduated_at = now(), updated_at = now()
    where id = v_current.id;
    -- See record_hiragana_drill_result above for why v_before_ts/earned_at comparison is safe.
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_katakana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$$;


--
-- Name: reroll_leaderboard_alias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reroll_leaderboard_alias() RETURNS TABLE(adjective text, noun text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_alias_id bigint;
begin
  if not public.account_is_active(auth.uid()) then
    return;
  end if;

  select id into v_alias_id
  from public.leaderboard_aliases
  order by random()
  limit 1;

  update public.user_study_settings
  set leaderboard_alias_id = v_alias_id,
      updated_at = now()
  where user_id = auth.uid();

  return query
    select a.adjective, a.noun
    from public.leaderboard_aliases a
    where a.id = v_alias_id;
end;
$$;


--
-- Name: resolve_user_timezone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_user_timezone(p_user_id uuid, p_timezone text DEFAULT NULL::text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    (select s.preferred_timezone from public.user_study_settings s where s.user_id = p_user_id and s.timezone_preference_enabled),
    nullif(p_timezone, ''),
    (select s.timezone from public.user_study_settings s where s.user_id = p_user_id),
    'UTC'
  );
$$;


--
-- Name: resume_katakana_on_kana_return(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resume_katakana_on_kana_return() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.study_track = 'standard' and new.study_track = 'kana' and new.study_katakana = false then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    and public.reading_test_passed(new.user_id, 'hiragana')
    then
      new.study_katakana := true;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: search_kanji(text, text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer) RETURNS TABLE(id bigint, kanji text, meanings text[], level text, kun_readings text[], on_readings text[], total_count bigint)
    LANGUAGE sql STABLE
    AS $$
  with params as (
    select
      nullif(p_query, '') as q,
      case
        when nullif(p_query, '') is null then null
        else replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
      end as q_escaped
  ),
  scored as (
    select
      k.*,
      case
        when params.q is null then 0
        when lower(k.kanji) = lower(params.q) then 0
        when exists (
          select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
          where lower(r) = lower(params.q)
        ) then 1
        when k.kanji ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike params.q_escaped || '%' escape '\'
          ) then 2
        when k.kanji ilike '%' || params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike '%' || params.q_escaped || '%' escape '\'
          ) then 3
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
        ) then 4
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 5
        else null
      end as match_rank
    from public.kanji k
    cross join params
    where (
      p_level is null
      or k.level = any(p_level)
      or (k.level is null and '>N1' = any(p_level))
    )
      -- Same technique as search_vocabulary: literal ILIKE predicates mirroring "match_rank is
      -- not null", so the planner can use the trigram indexes instead of scanning every row to
      -- evaluate the CASE. Each disjunct is a superset of its CASE branch, so this never drops a
      -- row the CASE would have ranked -- the CASE still re-derives the exact tier for ordering.
      and (
        params.q is null
        or k.kanji ilike '%' || params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(k.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, id asc
    limit p_limit offset p_offset
  )
  select id, kanji, meanings, level, kun_readings, on_readings, total_count
  from matches;
$$;


--
-- Name: search_vocabulary(text, text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer) RETURNS TABLE(id bigint, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, parts_of_speech text[], ids_kanji bigint[], jlpt_level text, is_common_jisho boolean, usually_kana boolean, romaji_reading text, furiganas text[], romaji_furiganas text[], other_readings text[], total_count bigint)
    LANGUAGE sql STABLE
    AS $$
  with params as (
    select
      nullif(p_query, '') as q,
      case
        when nullif(p_query, '') is null then null
        else replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
      end as q_escaped
  ),
  scored as (
    select
      v.*,
      dm.meanings as display_meanings,
      case
        when params.q is null then 0
        when lower(v.word) = lower(params.q) then 0
        when lower(v.kana_reading) = lower(params.q) or lower(v.romaji_reading) = lower(params.q)
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where lower(m) = lower(params.q)
          )
          then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
          )
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 4
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
    cross join lateral (select public.vocabulary_primary_meanings(v) as meanings) dm
    where v.study_enabled
      and (
        p_level is null
        or v.jlpt_level = any(p_level)
        or (v.jlpt_level is null and '>N1' = any(p_level))
      )
      -- Mirrors "match_rank is not null" as literal ILIKE predicates (not hidden inside the
      -- CASE above) so the planner can push them down to the trigram indexes instead of
      -- sequential-scanning the whole table to evaluate the CASE per row. Each disjunct here is
      -- a superset of its corresponding CASE branch (substring implies prefix implies exact for
      -- the same column), so this never excludes a row the CASE would have ranked -- it only
      -- narrows the scan before the CASE re-derives the exact tier for ordering.
      and (
        params.q is null
        or v.word ilike '%' || params.q_escaped || '%' escape '\'
        or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
        or v.romaji_reading ilike params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(dm.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, is_common_jisho desc, frequency_number desc nulls last, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, display_meanings as primary_meanings, other_meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: set_user_timezone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_timezone(p_user_id uuid, p_timezone text) RETURNS void
    LANGUAGE sql
    AS $$
  update public.user_study_settings
  set timezone = p_timezone, updated_at = now()
  where user_id = p_user_id
    and not timezone_preference_enabled
    and timezone is distinct from p_timezone
    and (p_timezone is null or exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_timezone));
$$;


--
-- Name: set_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: streak_display_count(integer, date, date[], date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.streak_display_count(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_today date) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_recent date[] := coalesce(p_recent_inactive, '{}');
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
  d date;
  v_end date;
begin
  if p_last_active_date is null then
    return 0;
  end if;
  if p_last_active_date >= p_today - 1 then
    return coalesce(p_current_streak, 0);
  end if;

  v_end := p_today - 1;
  for d in select generate_series(p_last_active_date + 1, v_end, interval '1 day')::date loop
    v_recent := array(select x from unnest(v_recent) x where x > d - v_window_days);
    v_recent := v_recent || d;
    if array_length(v_recent, 1) > v_free_limit then
      return 0;
    end if;
  end loop;

  return coalesce(p_current_streak, 0);
end;
$$;


--
-- Name: streak_free_days_per_week(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.streak_free_days_per_week() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select 2
$$;


--
-- Name: study_day(timestamp with time zone, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.study_day(p_at timestamp with time zone, p_timezone text, p_offset_hours integer DEFAULT 6) RETURNS date
    LANGUAGE sql STABLE
    AS $$
  select ((p_at at time zone p_timezone) - make_interval(hours => p_offset_hours))::date
$$;


--
-- Name: study_day_bounds(text, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.study_day_bounds(p_timezone text, p_offset_hours integer DEFAULT 6, p_at timestamp with time zone DEFAULT now()) RETURNS TABLE(day_start timestamp with time zone, day_end timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    (public.study_day(p_at, p_timezone, p_offset_hours)::timestamp + make_interval(hours => p_offset_hours))
      at time zone p_timezone,
    (public.study_day(p_at, p_timezone, p_offset_hours)::timestamp + make_interval(hours => p_offset_hours))
      at time zone p_timezone + interval '1 day'
$$;


--
-- Name: study_day_range(date, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.study_day_range(p_day date, p_timezone text DEFAULT 'UTC'::text, p_offset_hours integer DEFAULT 6) RETURNS TABLE(day_start timestamp with time zone, day_end timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    (p_day::timestamp + make_interval(hours => p_offset_hours)) at time zone p_timezone,
    (p_day::timestamp + make_interval(hours => p_offset_hours)) at time zone p_timezone + interval '1 day'
$$;


--
-- Name: submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_review(p_user_id uuid, p_exercise_type text, p_rating smallint, p_kanji_id bigint DEFAULT NULL::bigint, p_word_id bigint DEFAULT NULL::bigint, p_kanji_word_id bigint DEFAULT NULL::bigint, p_hiragana_id bigint DEFAULT NULL::bigint, p_katakana_id bigint DEFAULT NULL::bigint, p_user_answer text DEFAULT NULL::text, p_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(review_log_id bigint, resurfaces_today boolean, newly_unlocked_achievements text[])
    LANGUAGE plpgsql
    AS $$
declare
  v_current record;
  v_result record;
  v_kanji_id_for_log bigint;
  v_word_id_for_log bigint;
  v_hiragana_id_for_log bigint;
  v_katakana_id_for_log bigint;
  v_log_id bigint;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
begin
  if p_exercise_type not in ('kanji_meaning', 'kanji_reading', 'vocab_meaning', 'hiragana_reading', 'katakana_reading') then
    raise exception 'Invalid exercise_type "%"', p_exercise_type using errcode = 'SR400';
  end if;
  if p_rating not in (0, 1, 2, 3) then
    raise exception 'Invalid rating "%"', p_rating using errcode = 'SR400';
  end if;

  if p_exercise_type = 'kanji_meaning' then
    if p_kanji_id is null then
      raise exception 'kanji_id is required for exercise_type "kanji_meaning"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_kanji_meaning_progress
      where user_id = p_user_id and kanji_id = p_kanji_id;
  elsif p_exercise_type = 'kanji_reading' then
    if p_kanji_word_id is null then
      raise exception 'kanji_word_id is required for exercise_type "kanji_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_kanji_reading_progress
      where user_id = p_user_id and kanji_word_id = p_kanji_word_id;
  elsif p_exercise_type = 'vocab_meaning' then
    if p_word_id is null then
      raise exception 'word_id is required for exercise_type "vocab_meaning"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_vocabulary_progress
      where user_id = p_user_id and word_id = p_word_id;
  elsif p_exercise_type = 'hiragana_reading' then
    if p_hiragana_id is null then
      raise exception 'hiragana_id is required for exercise_type "hiragana_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_hiragana_progress
      where user_id = p_user_id and hiragana_id = p_hiragana_id;
  else
    if p_katakana_id is null then
      raise exception 'katakana_id is required for exercise_type "katakana_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_katakana_progress
      where user_id = p_user_id and katakana_id = p_katakana_id;
  end if;

  if v_current is null then
    raise exception 'No progress found for this card. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status in ('new', 'suspended') then
    raise exception 'Cannot review a card with status "%"', v_current.status using errcode = 'SR400';
  end if;

  select * into v_result from public.compute_review_result(
    v_current.status, v_current.ease_factor, v_current.interval_days,
    v_current.repetitions, v_current.lapses, v_current.learning_step, p_rating
  );

  if p_exercise_type = 'kanji_meaning' then
    update public.user_kanji_meaning_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_kanji_id_for_log := v_current.kanji_id;
  elsif p_exercise_type = 'kanji_reading' then
    update public.user_kanji_reading_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_kanji_id_for_log := v_current.kanji_id;
    select id_word into v_word_id_for_log from public.kanji_word where id = v_current.kanji_word_id;
  elsif p_exercise_type = 'vocab_meaning' then
    update public.user_vocabulary_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_word_id_for_log := v_current.word_id;
  elsif p_exercise_type = 'hiragana_reading' then
    update public.user_hiragana_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_hiragana_id_for_log := v_current.hiragana_id;
  else
    update public.user_katakana_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_katakana_id_for_log := v_current.katakana_id;
  end if;

  insert into public.review_logs (
    user_id, session_id, exercise_type, kanji_id, word_id, hiragana_id, katakana_id, rating, correct, user_answer,
    ease_factor_before, ease_factor_after, interval_before, interval_after,
    status_before, repetitions_before, lapses_before, learning_step_before, due_at_before
  ) values (
    p_user_id, p_session_id, p_exercise_type, v_kanji_id_for_log, v_word_id_for_log,
    v_hiragana_id_for_log, v_katakana_id_for_log, p_rating, p_rating >= 2, p_user_answer,
    v_current.ease_factor, v_result.ease_factor, v_current.interval_days, v_result.interval_days,
    v_current.status, v_current.repetitions, v_current.lapses, v_current.learning_step, v_current.due_at
  )
  returning id into v_log_id;

  -- The status update above (whichever branch ran) fires the relevant AFTER UPDATE OF status
  -- achievement trigger synchronously, so any newly-earned rows are already visible here.
  select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
    into v_new_achievements
    from public.user_achievements
    where user_id = p_user_id and earned_at >= v_before_ts;

  return query select v_log_id, (v_result.status != 'review'), v_new_achievements;
end;
$$;


--
-- Name: sync_new_vocab_per_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_new_vocab_per_day() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.new_vocab_per_day := new.new_kanji_per_day * 6;
  elsif TG_OP = 'UPDATE' then
    if new.new_kanji_per_day is distinct from old.new_kanji_per_day then
      new.new_vocab_per_day := new.new_kanji_per_day * 6;
    elsif new.new_vocab_per_day is distinct from old.new_vocab_per_day then
      new.new_kanji_per_day := round(new.new_vocab_per_day::numeric / 6)::int4;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: sync_user_continent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_user_continent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.country is null then
    new.continent := null;
  else
    select c.continent into new.continent
    from public.countries c
    where c.code = new.country;
  end if;
  return new;
end;
$$;


--
-- Name: undo_review(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_review(p_user_id uuid, p_review_log_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql
    AS $_$
declare
  v_log record;
  v_table text;
  v_key_column text;
  v_key_value bigint;
begin
  perform pg_advisory_xact_lock(hashtext('undo_review:' || p_user_id::text));

  if p_review_log_id is not null then
    select * into v_log from public.review_logs
      where id = p_review_log_id and user_id = p_user_id and undone = false;
  else
    select * into v_log from public.review_logs
      where user_id = p_user_id and undone = false
      order by reviewed_at desc
      limit 1;
  end if;

  if v_log is null then
    raise exception 'No undoable review found.' using errcode = 'SR404';
  end if;

  if v_log.exercise_type = 'kanji_meaning' then
    v_table := 'user_kanji_meaning_progress';
    v_key_column := 'kanji_id';
    v_key_value := v_log.kanji_id;
  elsif v_log.exercise_type = 'kanji_reading' then
    v_table := 'user_kanji_reading_progress';
    v_key_column := 'kanji_word_id';
    select kw.id into v_key_value from public.kanji_word kw
      where kw.id_kanji = v_log.kanji_id and kw.id_word = v_log.word_id;
  elsif v_log.exercise_type = 'vocab_meaning' then
    v_table := 'user_vocabulary_progress';
    v_key_column := 'word_id';
    v_key_value := v_log.word_id;
  elsif v_log.exercise_type = 'hiragana_reading' then
    v_table := 'user_hiragana_progress';
    v_key_column := 'hiragana_id';
    v_key_value := v_log.hiragana_id;
  else
    v_table := 'user_katakana_progress';
    v_key_column := 'katakana_id';
    v_key_value := v_log.katakana_id;
  end if;

  execute format(
    'update public.%I set status = $1, ease_factor = $2, interval_days = $3, repetitions = $4, lapses = $5, learning_step = $6, due_at = $7 where user_id = $8 and %I = $9',
    v_table, v_key_column
  )
  using v_log.status_before, v_log.ease_factor_before, v_log.interval_before, v_log.repetitions_before,
        v_log.lapses_before, v_log.learning_step_before, v_log.due_at_before, p_user_id, v_key_value;

  update public.review_logs set undone = true where id = v_log.id;
end;
$_$;


--
-- Name: user_hiragana_progress_updates_achievements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_hiragana_progress_updates_achievements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.evaluate_kana_achievements(new.user_id);
  return new;
end;
$$;


--
-- Name: user_katakana_progress_updates_achievements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_katakana_progress_updates_achievements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.evaluate_kana_achievements(new.user_id);
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vocabulary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vocabulary (
    id bigint NOT NULL,
    word text,
    kana_reading text,
    parts_of_speech text[],
    ids_kanji bigint[],
    jlpt_level text,
    is_common_jisho boolean,
    usually_kana boolean,
    romaji_reading text,
    furiganas text[],
    romaji_furiganas text[],
    other_readings text[],
    frequency_number integer,
    study_enabled boolean DEFAULT true NOT NULL,
    primary_meanings text[],
    other_meanings jsonb,
    short_meaning text,
    CONSTRAINT vocabulary_jlpt_level_check CHECK (((jlpt_level IS NULL) OR (jlpt_level = ANY (ARRAY['N5'::text, 'N4'::text, 'N3'::text, 'N2'::text, 'N1'::text]))))
);


--
-- Name: COLUMN vocabulary.primary_meanings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vocabulary.primary_meanings IS 'Copied from jmdict_entries.primary_meanings for the linked row(s) (jmdict_entries.vocabulary_ids contains this vocabulary.id). NULL until a linked jmdict_entries row exists. When more than one jmdict_entries row shares this vocabulary id (e.g. two distinct senses under one reading), their primary_meanings are concatenated in jmdict_entries.id order. Kept in sync from application code (lib/data/jmdictSenses.ts), not a DB trigger -- see file header.';


--
-- Name: COLUMN vocabulary.other_meanings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vocabulary.other_meanings IS 'Copied from jmdict_entries.other_meanings for the linked row(s), same shape (jsonb array of arrays, one inner array per non-primary sense). NULL until a linked jmdict_entries row exists; ''[]''::jsonb once linked but the linked row(s) have no secondary senses. Kept in sync from application code (lib/data/jmdictSenses.ts), not a DB trigger -- see file header.';


--
-- Name: COLUMN vocabulary.short_meaning; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vocabulary.short_meaning IS 'Admin-curated short (<=3-4 word) natural English gloss, used where primary_meanings entries are all too long to show compactly. NULL until curated. Edited from /admin/short-meanings.';


--
-- Name: vocabulary_primary_meanings(public.vocabulary); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vocabulary_primary_meanings(v public.vocabulary) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when nullif(trim(v.short_meaning), '') is not null then array[nullif(trim(v.short_meaning), '')] || v.primary_meanings
    else v.primary_meanings
  end;
$$;


--
-- Name: account_deletion_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletion_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    had_active_subscription boolean DEFAULT false NOT NULL,
    stripe_customer_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: account_deletion_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.account_deletion_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.account_deletion_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    code text NOT NULL,
    name text NOT NULL,
    continent text NOT NULL,
    CONSTRAINT countries_code_format_check CHECK ((code ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT countries_continent_check CHECK ((continent = ANY (ARRAY['Africa'::text, 'Asia'::text, 'Europe'::text, 'North America'::text, 'Oceania'::text, 'South America'::text])))
);


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id bigint NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    error_name text,
    message text NOT NULL,
    stack text,
    digest text,
    page_path text,
    previous_page_path text,
    breadcrumbs jsonb,
    context jsonb,
    user_agent text,
    CONSTRAINT error_logs_source_check CHECK ((source = ANY (ARRAY['react_error_boundary'::text, 'global_error_boundary'::text, 'window_error'::text, 'unhandled_rejection'::text, 'manual'::text])))
);


--
-- Name: TABLE error_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.error_logs IS 'Archive of client-side app errors for debugging -- who hit it, what page, what led up to it.';


--
-- Name: COLUMN error_logs.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.user_id IS 'Signed-in user who hit the error. Null is possible if a session expires mid-request.';


--
-- Name: COLUMN error_logs.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.source IS 'Capture mechanism: react_error_boundary (app/error.tsx), global_error_boundary (app/global-error.tsx), window_error (uncaught script error), unhandled_rejection (uncaught promise rejection), or manual (explicit logClientError call from app code).';


--
-- Name: COLUMN error_logs.page_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.page_path IS 'pathname + search of the page the error surfaced on.';


--
-- Name: COLUMN error_logs.previous_page_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.previous_page_path IS 'pathname of the last page the user visited before this one -- what they were doing right before the error.';


--
-- Name: COLUMN error_logs.breadcrumbs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.breadcrumbs IS 'Ordered [{at, path}] trail of recent page visits this session, most recent last.';


--
-- Name: COLUMN error_logs.context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_logs.context IS 'Free-form extra detail from the call site (component name, request payload, etc).';


--
-- Name: error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.error_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: free_lesson_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.free_lesson_leads (
    id bigint NOT NULL,
    name text NOT NULL,
    whatsapp text NOT NULL,
    consent boolean DEFAULT false NOT NULL,
    contacted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: free_lesson_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.free_lesson_leads ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.free_lesson_leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hiragana; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hiragana (
    id bigint NOT NULL,
    "character" text NOT NULL,
    romaji text NOT NULL,
    gojuon_row text NOT NULL,
    sort_order integer NOT NULL,
    kana_type text DEFAULT 'seion'::text NOT NULL,
    entry_kind text DEFAULT 'character'::text NOT NULL,
    sound_origin text DEFAULT 'native'::text NOT NULL,
    frequency_tier text DEFAULT 'core'::text NOT NULL,
    notes text,
    study_enabled boolean DEFAULT true NOT NULL,
    pack_id integer NOT NULL,
    drill_enabled boolean DEFAULT false NOT NULL,
    extended_romaji text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT hiragana_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['character'::text, 'rule'::text, 'example'::text]))),
    CONSTRAINT hiragana_frequency_tier_check CHECK ((frequency_tier = ANY (ARRAY['core'::text, 'rare'::text, 'very_rare'::text, 'historical'::text]))),
    CONSTRAINT hiragana_kana_type_check CHECK ((kana_type = ANY (ARRAY['seion'::text, 'dakuten'::text, 'handakuten'::text, 'yoon'::text, 'sokuon'::text, 'choonpu'::text, 'extended'::text, 'n_gemination'::text, 'rendaku'::text, 'particle_reading'::text, 'historical'::text]))),
    CONSTRAINT hiragana_sound_origin_check CHECK ((sound_origin = ANY (ARRAY['native'::text, 'loanword'::text])))
);


--
-- Name: COLUMN hiragana.extended_romaji; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hiragana.extended_romaji IS 'Extra accepted spellings for this row, on top of romaji: Hepburn, Kunrei, Nihon, BGN/PCGN, common variants and IME key sequences, stored as written in romaji-tables.tsv. Empty array when no extra spelling is known yet.';


--
-- Name: hiragana_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hiragana ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hiragana_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kana_rule_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kana_rule_labels (
    kana_type text NOT NULL,
    label text NOT NULL,
    technical_term text NOT NULL,
    sort_order integer NOT NULL
);


--
-- Name: kanji; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanji (
    id bigint NOT NULL,
    kanji text,
    meanings text[],
    level text,
    kun_readings text[],
    on_readings text[],
    CONSTRAINT kanji_level_check CHECK (((level IS NULL) OR (level = ANY (ARRAY['N5'::text, 'N4'::text, 'N3'::text, 'N2'::text, 'N1'::text]))))
);


--
-- Name: kanji_detail_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanji_detail_words (
    kanji_id bigint NOT NULL,
    kanji_word_id bigint NOT NULL,
    rank integer NOT NULL
);


--
-- Name: kanji_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanji_rules (
    id bigint NOT NULL,
    rule_type text NOT NULL,
    rule_group text NOT NULL,
    entry_kind text NOT NULL,
    "character" text NOT NULL,
    romaji text NOT NULL,
    sort_order integer NOT NULL,
    sound_origin text DEFAULT 'native'::text NOT NULL,
    frequency_tier text DEFAULT 'core'::text NOT NULL,
    notes text,
    CONSTRAINT kanji_rules_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['rule'::text, 'example'::text]))),
    CONSTRAINT kanji_rules_frequency_tier_check CHECK ((frequency_tier = ANY (ARRAY['core'::text, 'rare'::text, 'very_rare'::text, 'historical'::text]))),
    CONSTRAINT kanji_rules_sound_origin_check CHECK ((sound_origin = ANY (ARRAY['native'::text, 'loanword'::text])))
);


--
-- Name: kanji_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.kanji_rules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kanji_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kanji_word; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanji_word (
    id bigint NOT NULL,
    id_kanji bigint,
    id_word bigint,
    reading_group integer NOT NULL
);


--
-- Name: katakana; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.katakana (
    id bigint NOT NULL,
    "character" text NOT NULL,
    romaji text NOT NULL,
    gojuon_row text NOT NULL,
    sort_order integer NOT NULL,
    kana_type text DEFAULT 'seion'::text NOT NULL,
    entry_kind text DEFAULT 'character'::text NOT NULL,
    sound_origin text DEFAULT 'native'::text NOT NULL,
    frequency_tier text DEFAULT 'core'::text NOT NULL,
    notes text,
    study_enabled boolean DEFAULT true NOT NULL,
    pack_id integer NOT NULL,
    drill_enabled boolean DEFAULT false NOT NULL,
    extended_romaji text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT katakana_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['character'::text, 'rule'::text, 'example'::text]))),
    CONSTRAINT katakana_frequency_tier_check CHECK ((frequency_tier = ANY (ARRAY['core'::text, 'rare'::text, 'very_rare'::text, 'historical'::text]))),
    CONSTRAINT katakana_kana_type_check CHECK ((kana_type = ANY (ARRAY['seion'::text, 'dakuten'::text, 'handakuten'::text, 'yoon'::text, 'sokuon'::text, 'choonpu'::text, 'extended'::text, 'n_gemination'::text, 'rendaku'::text, 'particle_reading'::text, 'historical'::text]))),
    CONSTRAINT katakana_sound_origin_check CHECK ((sound_origin = ANY (ARRAY['native'::text, 'loanword'::text])))
);


--
-- Name: COLUMN katakana.extended_romaji; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.katakana.extended_romaji IS 'Extra accepted spellings for this row, on top of romaji: Hepburn, Kunrei, Nihon, BGN/PCGN, common variants and IME key sequences, stored as written in romaji-tables.tsv. Empty array when no extra spelling is known yet.';


--
-- Name: katakana_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.katakana ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.katakana_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: leaderboard_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_aliases (
    id bigint NOT NULL,
    adjective text NOT NULL,
    noun text NOT NULL
);


--
-- Name: leaderboard_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.leaderboard_aliases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.leaderboard_aliases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: leaderboard_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_daily_stats (
    user_id uuid NOT NULL,
    day date NOT NULL,
    reviews_count integer DEFAULT 0 NOT NULL,
    new_cards_count integer DEFAULT 0 NOT NULL,
    xp_points integer DEFAULT 0 NOT NULL,
    test_count bigint DEFAULT 0 NOT NULL
);


--
-- Name: leaderboard_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_stats (
    user_id uuid NOT NULL,
    reviews_count bigint DEFAULT 0 NOT NULL,
    new_cards_count bigint DEFAULT 0 NOT NULL,
    xp_points bigint DEFAULT 0 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    last_active_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    longest_streak integer DEFAULT 0 NOT NULL,
    streak_recent_inactive date[] DEFAULT '{}'::date[] NOT NULL,
    test_count bigint DEFAULT 0 NOT NULL
);


--
-- Name: morphology_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.morphology_rules (
    part_of_speech_type text[],
    category text[],
    dictionary_example text[],
    polite_stem text[],
    polite_present_form text[],
    negative_stem text[],
    present_negative_form text[],
    past_form text[],
    past_negative_form text[],
    te_form text[],
    te_negative_form text[],
    volitional_form text[],
    ba_conditional text[],
    ba_conditional_negative text[],
    tara_conditional text[],
    tara_conditional_negative text[],
    nara_conditional text[],
    to_conditional text[],
    potential_present_form text[],
    potential_present_negative_form text[],
    potential_past_form text[],
    potential_past_negative_form text[],
    potential_te_form text[],
    potential_ba_conditional text[],
    potential_tara_conditional text[],
    potential_polite_present_form text[],
    potential_polite_present_negative_form text[],
    potential_polite_past_form text[],
    potential_polite_past_negative_form text[],
    passive_present_form text[],
    passive_present_negative_form text[],
    passive_past_form text[],
    passive_past_negative_form text[],
    passive_te_form text[],
    passive_ba_conditional text[],
    passive_polite_present_form text[],
    passive_polite_present_negative_form text[],
    passive_polite_past_form text[],
    passive_polite_past_negative_form text[],
    causative_present_form text[],
    causative_present_negative_form text[],
    causative_past_form text[],
    causative_past_negative_form text[],
    causative_te_form text[],
    causative_ba_conditional text[],
    causative_polite_present_form text[],
    causative_polite_present_negative_form text[],
    causative_polite_past_form text[],
    causative_polite_past_negative_form text[],
    causative_passive_present_form text[],
    causative_passive_present_negative_form text[],
    causative_passive_past_form text[],
    causative_passive_past_negative_form text[],
    causative_passive_polite_present_form text[],
    causative_passive_polite_present_negative_form text[],
    causative_passive_polite_past_form text[],
    causative_passive_polite_past_negative_form text[],
    continuous_present_form text[],
    continuous_present_negative_form text[],
    continuous_past_form text[],
    continuous_past_negative_form text[],
    continuous_polite_present_form text[],
    continuous_polite_present_negative_form text[],
    continuous_polite_past_form text[],
    continuous_polite_past_negative_form text[],
    continuous_ba_conditional text[],
    continuous_tara_conditional text[],
    continuous_volitional_form text[],
    continuous_polite_volitional_form text[],
    tai_present_form text[],
    tai_present_negative_form text[],
    tai_past_form text[],
    tai_past_negative_form text[],
    tai_te_form text[],
    polite_present_negative_form text[],
    polite_past_form text[],
    polite_past_negative_form text[],
    polite_volitional_form text[],
    polite_te_form text[],
    imperative_form text[],
    imperative_negative_form text[],
    present_affirmative_form text[],
    past_affirmative_form text[],
    ba_conditional_form text[],
    ba_conditional_negative_form text[],
    tara_conditional_form text[],
    tara_conditional_negative_form text[],
    nara_conditional_form text[],
    to_conditional_form text[],
    adverbial_form text[],
    noun_form text[],
    polite_present_affirmative_form text[],
    polite_past_affirmative_form text[]
);


--
-- Name: practice_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_logs (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    exercise_type text NOT NULL,
    kanji_id bigint,
    word_id bigint,
    hiragana_id bigint,
    katakana_id bigint,
    correct boolean NOT NULL,
    practiced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: practice_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.practice_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.practice_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: test; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test (
    id bigint NOT NULL,
    sort_order integer NOT NULL,
    question text NOT NULL,
    romaji text NOT NULL,
    english text NOT NULL,
    particle_furiganas text[],
    test_type text DEFAULT 'hiragana'::text NOT NULL,
    CONSTRAINT test_test_type_check CHECK ((test_type = ANY (ARRAY['hiragana'::text, 'katakana'::text])))
);


--
-- Name: reading_test_sentences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.test ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reading_test_sentences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: review_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_logs (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    exercise_type text NOT NULL,
    kanji_id bigint,
    word_id bigint,
    rating smallint NOT NULL,
    correct boolean NOT NULL,
    user_answer text,
    ease_factor_before numeric(4,2),
    ease_factor_after numeric(4,2),
    interval_before integer,
    interval_after integer,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    undone boolean DEFAULT false NOT NULL,
    status_before text,
    repetitions_before integer,
    lapses_before integer,
    learning_step_before integer,
    due_at_before timestamp with time zone,
    session_id bigint,
    hiragana_id bigint,
    katakana_id bigint,
    CONSTRAINT review_logs_exercise_type_check CHECK ((exercise_type = ANY (ARRAY['kanji_meaning'::text, 'kanji_reading'::text, 'vocab_meaning'::text, 'hiragana_reading'::text, 'katakana_reading'::text]))),
    CONSTRAINT review_logs_rating_check CHECK (((rating >= 0) AND (rating <= 3)))
);


--
-- Name: review_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.review_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.review_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: study_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_sessions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    cards_reviewed integer DEFAULT 0 NOT NULL,
    cards_correct integer DEFAULT 0 NOT NULL,
    new_cards_learned integer DEFAULT 0 NOT NULL
);


--
-- Name: study_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.study_sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.study_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: test_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_status (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    test_type text NOT NULL,
    attempt_number integer NOT NULL,
    percent integer NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    achievement_key text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone
);


--
-- Name: user_achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_achievements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.test_status ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_badges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_hiragana_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_hiragana_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    hiragana_id bigint NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    status_before text,
    ease_factor numeric DEFAULT 2.5 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    learning_step integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    session_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    drill_streak integer DEFAULT 0 NOT NULL,
    pack_pending boolean DEFAULT false NOT NULL,
    last_drilled_at timestamp with time zone,
    graduated_at timestamp with time zone,
    CONSTRAINT user_hiragana_progress_status_before_check CHECK (((status_before IS NULL) OR (status_before = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))),
    CONSTRAINT user_hiragana_progress_status_check CHECK ((status = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text, 'suspended'::text])))
);


--
-- Name: user_hiragana_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_hiragana_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_hiragana_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_hiragana_rule_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_hiragana_rule_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    hiragana_id bigint NOT NULL,
    session_id bigint,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_hiragana_rule_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_hiragana_rule_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_hiragana_rule_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_kanji_basics_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_kanji_basics_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    step smallint NOT NULL,
    session_id bigint,
    seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_kanji_basics_progress_step_check CHECK ((step = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: user_kanji_basics_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_basics_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_kanji_basics_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_kanji_meaning_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_kanji_meaning_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    kanji_id bigint NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    ease_factor numeric(4,2) DEFAULT 2.5 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    learning_step integer DEFAULT 0 NOT NULL,
    session_id bigint,
    status_before text,
    CONSTRAINT user_kanji_meaning_progress_status_before_check CHECK (((status_before IS NULL) OR (status_before = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))),
    CONSTRAINT user_kanji_meaning_progress_status_check CHECK ((status = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text, 'suspended'::text])))
);


--
-- Name: user_kanji_meaning_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_meaning_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_kanji_meaning_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_kanji_reading_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_kanji_reading_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    kanji_id bigint NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    ease_factor numeric(4,2) DEFAULT 2.5 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kanji_word_id bigint NOT NULL,
    learning_step integer DEFAULT 0 NOT NULL,
    status_before text,
    CONSTRAINT user_kanji_reading_progress_status_before_check CHECK (((status_before IS NULL) OR (status_before = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))),
    CONSTRAINT user_kanji_reading_progress_status_check CHECK ((status = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text, 'suspended'::text])))
);


--
-- Name: user_kanji_reading_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_reading_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_kanji_reading_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_katakana_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_katakana_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    katakana_id bigint NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    status_before text,
    ease_factor numeric DEFAULT 2.5 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    learning_step integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    session_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    drill_streak integer DEFAULT 0 NOT NULL,
    pack_pending boolean DEFAULT false NOT NULL,
    last_drilled_at timestamp with time zone,
    graduated_at timestamp with time zone,
    CONSTRAINT user_katakana_progress_status_before_check CHECK (((status_before IS NULL) OR (status_before = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))),
    CONSTRAINT user_katakana_progress_status_check CHECK ((status = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text, 'suspended'::text])))
);


--
-- Name: user_katakana_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_katakana_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_katakana_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_katakana_rule_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_katakana_rule_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    katakana_id bigint NOT NULL,
    session_id bigint,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_katakana_rule_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_katakana_rule_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_katakana_rule_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_reading_test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reading_test_attempts (
    user_id uuid NOT NULL,
    test_type text NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started boolean DEFAULT false NOT NULL,
    queue_order bigint[],
    queue_position integer DEFAULT 0 NOT NULL,
    draft_sentence_id bigint,
    draft_answer text DEFAULT ''::text NOT NULL,
    draft_updated_at timestamp with time zone
);


--
-- Name: user_reading_test_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reading_test_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    test_type text NOT NULL,
    sentence_id bigint NOT NULL,
    correct boolean DEFAULT true NOT NULL,
    user_answer text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_reading_test_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_reading_test_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_reading_test_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_study_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_study_settings (
    user_id uuid NOT NULL,
    new_kanji_per_day integer DEFAULT 1 NOT NULL,
    max_reviews_per_day integer DEFAULT 50 NOT NULL,
    enabled_levels text[],
    study_kanji boolean DEFAULT false NOT NULL,
    study_vocabulary boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    new_vocab_per_day integer DEFAULT 6 NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    leaderboard_anonymous boolean,
    include_lower_levels boolean DEFAULT false NOT NULL,
    leaderboard_alias_id bigint,
    onboarding_step smallint DEFAULT 0 NOT NULL,
    preferred_server_region text,
    onboarding_furthest_step smallint DEFAULT 0 NOT NULL,
    study_track text,
    study_hiragana boolean DEFAULT false NOT NULL,
    study_katakana boolean DEFAULT false NOT NULL,
    new_hiragana_per_day integer DEFAULT 15 NOT NULL,
    new_katakana_per_day integer DEFAULT 15 NOT NULL,
    timezone text,
    kana_practice_enabled boolean DEFAULT false NOT NULL,
    extended_romaji_enabled boolean DEFAULT false NOT NULL,
    timezone_preference_enabled boolean DEFAULT false NOT NULL,
    preferred_timezone text,
    CONSTRAINT user_study_settings_enabled_levels_check CHECK (((enabled_levels IS NULL) OR ((enabled_levels <@ ARRAY['N5'::text, 'N4'::text, 'N3'::text, 'N2'::text, 'N1'::text]) AND (COALESCE(array_length(enabled_levels, 1), 0) >= 1)))),
    CONSTRAINT user_study_settings_kana_level_check CHECK (((study_track <> 'kana'::text) OR (enabled_levels = ARRAY['N5'::text]))),
    CONSTRAINT user_study_settings_max_reviews_per_day_check CHECK ((max_reviews_per_day > 0)),
    CONSTRAINT user_study_settings_new_hiragana_per_day_check CHECK (((new_hiragana_per_day >= 5) AND ((new_hiragana_per_day % 5) = 0))),
    CONSTRAINT user_study_settings_new_katakana_per_day_check CHECK (((new_katakana_per_day >= 5) AND ((new_katakana_per_day % 5) = 0))),
    CONSTRAINT user_study_settings_onboarding_furthest_step_check CHECK (((onboarding_furthest_step >= 0) AND (onboarding_furthest_step <= 5))),
    CONSTRAINT user_study_settings_onboarding_step_check CHECK (((onboarding_step >= 0) AND (onboarding_step <= 5))),
    CONSTRAINT user_study_settings_preferred_server_region_check CHECK (((preferred_server_region IS NULL) OR (preferred_server_region = ANY (ARRAY['America'::text, 'Europe'::text])))),
    CONSTRAINT user_study_settings_study_track_check CHECK ((study_track = ANY (ARRAY['kana'::text, 'standard'::text]))),
    CONSTRAINT user_study_settings_timezone_preference_check CHECK (((NOT timezone_preference_enabled) OR (preferred_timezone IS NOT NULL))),
    CONSTRAINT user_study_settings_track_separation_check CHECK ((((study_track = 'kana'::text) AND (study_kanji = false) AND (study_vocabulary = false)) OR ((study_track = 'standard'::text) AND (study_hiragana = false) AND (study_katakana = false))))
);


--
-- Name: COLUMN user_study_settings.extended_romaji_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_study_settings.extended_romaji_enabled IS 'When true, kana reading cards also accept every value of hiragana.extended_romaji / katakana.extended_romaji as a correct answer, on top of romaji. Default false = romaji only.';


--
-- Name: COLUMN user_study_settings.timezone_preference_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_study_settings.timezone_preference_enabled IS 'When true, the study day, daily limits, streak and leaderboards use preferred_timezone instead of the timezone the browser reports. Default false = follow the browser.';


--
-- Name: COLUMN user_study_settings.preferred_timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_study_settings.preferred_timezone IS 'IANA timezone name the student picked in Settings -> Study. Kept while timezone_preference_enabled is false so switching it back on restores the pick. Only takes effect while timezone_preference_enabled is true.';


--
-- Name: user_vocabulary_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_vocabulary_progress (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    word_id bigint NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    ease_factor numeric(4,2) DEFAULT 2.5 NOT NULL,
    interval_days integer DEFAULT 0 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    learning_step integer DEFAULT 0 NOT NULL,
    session_id bigint,
    status_before text,
    pending_batch boolean DEFAULT false NOT NULL,
    CONSTRAINT user_vocabulary_progress_status_before_check CHECK (((status_before IS NULL) OR (status_before = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))),
    CONSTRAINT user_vocabulary_progress_status_check CHECK ((status = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text, 'suspended'::text])))
);


--
-- Name: user_vocabulary_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_vocabulary_progress ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_vocabulary_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    display_name text,
    avatar_url text,
    stripe_customer_id text,
    is_premium boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    country text,
    continent text,
    undo_disabled boolean DEFAULT false NOT NULL,
    show_country_on_leaderboard boolean DEFAULT true NOT NULL,
    admin boolean DEFAULT false NOT NULL,
    pending_deletion_at timestamp with time zone,
    CONSTRAINT users_display_name_length_check CHECK ((char_length(display_name) <= 50)),
    CONSTRAINT users_email_gmail_check CHECK ((email ~* '^[^@\s]+@gmail\.com$'::text))
);


--
-- Name: account_deletion_log account_deletion_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_log
    ADD CONSTRAINT account_deletion_log_pkey PRIMARY KEY (id);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (code);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: free_lesson_leads free_lesson_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_lesson_leads
    ADD CONSTRAINT free_lesson_leads_pkey PRIMARY KEY (id);


--
-- Name: hiragana hiragana_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiragana
    ADD CONSTRAINT hiragana_pkey PRIMARY KEY (id);


--
-- Name: hiragana hiragana_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiragana
    ADD CONSTRAINT hiragana_sort_order_key UNIQUE (sort_order);

ALTER TABLE public.hiragana CLUSTER ON hiragana_sort_order_key;


--
-- Name: kana_rule_labels kana_rule_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kana_rule_labels
    ADD CONSTRAINT kana_rule_labels_pkey PRIMARY KEY (kana_type);


--
-- Name: kana_rule_labels kana_rule_labels_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kana_rule_labels
    ADD CONSTRAINT kana_rule_labels_sort_order_key UNIQUE (sort_order);


--
-- Name: kanji_detail_words kanji_detail_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_detail_words
    ADD CONSTRAINT kanji_detail_words_pkey PRIMARY KEY (kanji_id, kanji_word_id);


--
-- Name: kanji kanji_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji
    ADD CONSTRAINT kanji_pkey PRIMARY KEY (id);


--
-- Name: kanji_rules kanji_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_rules
    ADD CONSTRAINT kanji_rules_pkey PRIMARY KEY (id);


--
-- Name: kanji_rules kanji_rules_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_rules
    ADD CONSTRAINT kanji_rules_sort_order_key UNIQUE (sort_order);


--
-- Name: kanji_word kanji_word_id_kanji_id_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_word
    ADD CONSTRAINT kanji_word_id_kanji_id_word_key UNIQUE (id_kanji, id_word);


--
-- Name: kanji_word kanji_word_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_word
    ADD CONSTRAINT kanji_word_pkey PRIMARY KEY (id);


--
-- Name: katakana katakana_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.katakana
    ADD CONSTRAINT katakana_pkey PRIMARY KEY (id);


--
-- Name: katakana katakana_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.katakana
    ADD CONSTRAINT katakana_sort_order_key UNIQUE (sort_order);

ALTER TABLE public.katakana CLUSTER ON katakana_sort_order_key;


--
-- Name: leaderboard_aliases leaderboard_aliases_adjective_noun_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_aliases
    ADD CONSTRAINT leaderboard_aliases_adjective_noun_key UNIQUE (adjective, noun);


--
-- Name: leaderboard_aliases leaderboard_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_aliases
    ADD CONSTRAINT leaderboard_aliases_pkey PRIMARY KEY (id);


--
-- Name: leaderboard_daily_stats leaderboard_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_daily_stats
    ADD CONSTRAINT leaderboard_daily_stats_pkey PRIMARY KEY (user_id, day);


--
-- Name: leaderboard_stats leaderboard_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_stats
    ADD CONSTRAINT leaderboard_stats_pkey PRIMARY KEY (user_id);


--
-- Name: practice_logs practice_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_pkey PRIMARY KEY (id);


--
-- Name: review_logs review_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_pkey PRIMARY KEY (id);


--
-- Name: study_sessions study_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_pkey PRIMARY KEY (id);


--
-- Name: test test_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test
    ADD CONSTRAINT test_pkey PRIMARY KEY (id);


--
-- Name: test_status test_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_status
    ADD CONSTRAINT test_status_pkey PRIMARY KEY (id);


--
-- Name: test_status test_status_user_test_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_status
    ADD CONSTRAINT test_status_user_test_type_key UNIQUE (user_id, test_type);


--
-- Name: test test_test_type_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test
    ADD CONSTRAINT test_test_type_sort_order_key UNIQUE (test_type, sort_order);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_user_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_key_key UNIQUE (user_id, achievement_key);


--
-- Name: user_hiragana_progress user_hiragana_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_progress
    ADD CONSTRAINT user_hiragana_progress_pkey PRIMARY KEY (id);


--
-- Name: user_hiragana_progress user_hiragana_progress_user_id_hiragana_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_progress
    ADD CONSTRAINT user_hiragana_progress_user_id_hiragana_id_key UNIQUE (user_id, hiragana_id);


--
-- Name: user_hiragana_rule_progress user_hiragana_rule_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_rule_progress
    ADD CONSTRAINT user_hiragana_rule_progress_pkey PRIMARY KEY (id);


--
-- Name: user_hiragana_rule_progress user_hiragana_rule_progress_user_id_hiragana_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_rule_progress
    ADD CONSTRAINT user_hiragana_rule_progress_user_id_hiragana_id_key UNIQUE (user_id, hiragana_id);


--
-- Name: user_kanji_basics_progress user_kanji_basics_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_basics_progress
    ADD CONSTRAINT user_kanji_basics_progress_pkey PRIMARY KEY (id);


--
-- Name: user_kanji_basics_progress user_kanji_basics_progress_user_id_step_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_basics_progress
    ADD CONSTRAINT user_kanji_basics_progress_user_id_step_key UNIQUE (user_id, step);


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_meaning_progress
    ADD CONSTRAINT user_kanji_meaning_progress_pkey PRIMARY KEY (id);


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_user_id_kanji_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_meaning_progress
    ADD CONSTRAINT user_kanji_meaning_progress_user_id_kanji_id_key UNIQUE (user_id, kanji_id);


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_reading_progress
    ADD CONSTRAINT user_kanji_reading_progress_pkey PRIMARY KEY (id);


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_user_id_kanji_word_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_reading_progress
    ADD CONSTRAINT user_kanji_reading_progress_user_id_kanji_word_id_key UNIQUE (user_id, kanji_word_id);


--
-- Name: user_katakana_progress user_katakana_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_progress
    ADD CONSTRAINT user_katakana_progress_pkey PRIMARY KEY (id);


--
-- Name: user_katakana_progress user_katakana_progress_user_id_katakana_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_progress
    ADD CONSTRAINT user_katakana_progress_user_id_katakana_id_key UNIQUE (user_id, katakana_id);


--
-- Name: user_katakana_rule_progress user_katakana_rule_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_rule_progress
    ADD CONSTRAINT user_katakana_rule_progress_pkey PRIMARY KEY (id);


--
-- Name: user_katakana_rule_progress user_katakana_rule_progress_user_id_katakana_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_rule_progress
    ADD CONSTRAINT user_katakana_rule_progress_user_id_katakana_id_key UNIQUE (user_id, katakana_id);


--
-- Name: user_reading_test_attempts user_reading_test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_attempts
    ADD CONSTRAINT user_reading_test_attempts_pkey PRIMARY KEY (user_id, test_type);


--
-- Name: user_reading_test_progress user_reading_test_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_progress
    ADD CONSTRAINT user_reading_test_progress_pkey PRIMARY KEY (id);


--
-- Name: user_reading_test_progress user_reading_test_progress_user_sentence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_progress
    ADD CONSTRAINT user_reading_test_progress_user_sentence_key UNIQUE (user_id, sentence_id);


--
-- Name: user_study_settings user_study_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_settings
    ADD CONSTRAINT user_study_settings_pkey PRIMARY KEY (user_id);


--
-- Name: user_vocabulary_progress user_vocabulary_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vocabulary_progress
    ADD CONSTRAINT user_vocabulary_progress_pkey PRIMARY KEY (id);


--
-- Name: user_vocabulary_progress user_vocabulary_progress_user_id_word_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vocabulary_progress
    ADD CONSTRAINT user_vocabulary_progress_user_id_word_id_key UNIQUE (user_id, word_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: vocabulary vocabulary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vocabulary
    ADD CONSTRAINT vocabulary_pkey PRIMARY KEY (id);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at);


--
-- Name: idx_error_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_user_created ON public.error_logs USING btree (user_id, created_at);


--
-- Name: idx_kanji_detail_words_kanji_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_detail_words_kanji_rank ON public.kanji_detail_words USING btree (kanji_id, rank);


--
-- Name: idx_kanji_kanji_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_kanji_trgm ON public.kanji USING gin (kanji extensions.gin_trgm_ops);


--
-- Name: idx_kanji_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_level ON public.kanji USING btree (level);


--
-- Name: idx_kanji_meanings_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_meanings_trgm ON public.kanji USING gin (public.immutable_array_to_string(COALESCE(meanings, '{}'::text[])) extensions.gin_trgm_ops);


--
-- Name: idx_kanji_readings_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_readings_trgm ON public.kanji USING gin (public.immutable_array_to_string((COALESCE(kun_readings, '{}'::text[]) || COALESCE(on_readings, '{}'::text[]))) extensions.gin_trgm_ops);


--
-- Name: idx_kanji_word_id_kanji; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_word_id_kanji ON public.kanji_word USING btree (id_kanji);


--
-- Name: idx_kanji_word_id_word; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanji_word_id_word ON public.kanji_word USING btree (id_word);


--
-- Name: idx_leaderboard_daily_stats_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leaderboard_daily_stats_day ON public.leaderboard_daily_stats USING btree (day);


--
-- Name: idx_practice_logs_user_practiced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_logs_user_practiced ON public.practice_logs USING btree (user_id, practiced_at);


--
-- Name: idx_review_logs_reviewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_logs_reviewed_at ON public.review_logs USING btree (reviewed_at) WHERE (undone = false);


--
-- Name: idx_review_logs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_logs_session ON public.review_logs USING btree (session_id);


--
-- Name: idx_study_sessions_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_study_sessions_user_started ON public.study_sessions USING btree (user_id, started_at);


--
-- Name: idx_test_status_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_status_user ON public.test_status USING btree (user_id);


--
-- Name: idx_uhp_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uhp_created_at ON public.user_hiragana_progress USING btree (created_at);


--
-- Name: idx_uhp_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uhp_session ON public.user_hiragana_progress USING btree (session_id);


--
-- Name: idx_uhp_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uhp_user_created ON public.user_hiragana_progress USING btree (user_id, created_at);


--
-- Name: idx_uhp_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uhp_user_due ON public.user_hiragana_progress USING btree (user_id, due_at);


--
-- Name: idx_uhrp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uhrp_user ON public.user_hiragana_rule_progress USING btree (user_id);


--
-- Name: idx_ukbp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukbp_user ON public.user_kanji_basics_progress USING btree (user_id);


--
-- Name: idx_ukmp_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukmp_created_at ON public.user_kanji_meaning_progress USING btree (created_at);


--
-- Name: idx_ukmp_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukmp_user_created ON public.user_kanji_meaning_progress USING btree (user_id, created_at);


--
-- Name: idx_ukmp_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukmp_user_due ON public.user_kanji_meaning_progress USING btree (user_id, due_at);


--
-- Name: idx_ukp_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukp_created_at ON public.user_katakana_progress USING btree (created_at);


--
-- Name: idx_ukp_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukp_session ON public.user_katakana_progress USING btree (session_id);


--
-- Name: idx_ukp_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukp_user_created ON public.user_katakana_progress USING btree (user_id, created_at);


--
-- Name: idx_ukp_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukp_user_due ON public.user_katakana_progress USING btree (user_id, due_at);


--
-- Name: idx_ukrp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukrp_user ON public.user_katakana_rule_progress USING btree (user_id);


--
-- Name: idx_ukrp_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ukrp_user_due ON public.user_kanji_reading_progress USING btree (user_id, due_at);


--
-- Name: idx_urtp_user_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_urtp_user_test ON public.user_reading_test_progress USING btree (user_id, test_type);


--
-- Name: idx_user_achievements_unacknowledged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_achievements_unacknowledged ON public.user_achievements USING btree (user_id) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_user_achievements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_achievements_user ON public.user_achievements USING btree (user_id);


--
-- Name: idx_user_kanji_meaning_progress_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_kanji_meaning_progress_session ON public.user_kanji_meaning_progress USING btree (session_id);


--
-- Name: idx_user_vocabulary_progress_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_vocabulary_progress_session ON public.user_vocabulary_progress USING btree (session_id);


--
-- Name: idx_users_pending_deletion_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_pending_deletion_at ON public.users USING btree (pending_deletion_at) WHERE (pending_deletion_at IS NOT NULL);


--
-- Name: idx_uvp_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvp_created_at ON public.user_vocabulary_progress USING btree (created_at);


--
-- Name: idx_uvp_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvp_user_created ON public.user_vocabulary_progress USING btree (user_id, created_at);


--
-- Name: idx_uvp_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvp_user_due ON public.user_vocabulary_progress USING btree (user_id, due_at);


--
-- Name: idx_vocabulary_jlpt_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vocabulary_jlpt_level ON public.vocabulary USING btree (jlpt_level);


--
-- Name: idx_vocabulary_kana_reading_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vocabulary_kana_reading_trgm ON public.vocabulary USING gin (kana_reading extensions.gin_trgm_ops);


--
-- Name: idx_vocabulary_romaji_reading_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vocabulary_romaji_reading_trgm ON public.vocabulary USING gin (romaji_reading extensions.gin_trgm_ops);


--
-- Name: idx_vocabulary_word; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vocabulary_word ON public.vocabulary USING btree (word);


--
-- Name: idx_vocabulary_word_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vocabulary_word_trgm ON public.vocabulary USING gin (word extensions.gin_trgm_ops);


--
-- Name: review_logs_user_id_reviewed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_logs_user_id_reviewed_at_idx ON public.review_logs USING btree (user_id, reviewed_at);


--
-- Name: user_study_settings apply_timezone_preference_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER apply_timezone_preference_trigger BEFORE INSERT OR UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.apply_timezone_preference();


--
-- Name: user_study_settings assign_leaderboard_alias_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assign_leaderboard_alias_trigger BEFORE INSERT OR UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.assign_leaderboard_alias();


--
-- Name: user_study_settings clamp_new_card_caps_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clamp_new_card_caps_trigger BEFORE INSERT OR UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.clamp_new_card_caps();


--
-- Name: user_study_settings enforce_katakana_requires_hiragana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_katakana_requires_hiragana_trigger BEFORE UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.enforce_katakana_requires_hiragana_mastered();


--
-- Name: user_hiragana_progress hiragana_auto_activate_katakana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hiragana_auto_activate_katakana_trigger AFTER UPDATE ON public.user_hiragana_progress FOR EACH ROW EXECUTE FUNCTION public.hiragana_auto_activate_katakana();


--
-- Name: user_hiragana_progress hiragana_regression_disables_katakana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hiragana_regression_disables_katakana_trigger AFTER UPDATE ON public.user_hiragana_progress FOR EACH ROW EXECUTE FUNCTION public.hiragana_regression_disables_katakana();


--
-- Name: user_katakana_progress katakana_auto_activate_standard_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER katakana_auto_activate_standard_trigger AFTER UPDATE ON public.user_katakana_progress FOR EACH ROW EXECUTE FUNCTION public.katakana_auto_activate_standard();


--
-- Name: user_hiragana_progress leaderboard_stats_hiragana_drill_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_hiragana_drill_trigger AFTER UPDATE OF last_drilled_at ON public.user_hiragana_progress FOR EACH ROW WHEN ((new.last_drilled_at IS DISTINCT FROM old.last_drilled_at)) EXECUTE FUNCTION public.leaderboard_stats_on_drill();


--
-- Name: user_katakana_progress leaderboard_stats_katakana_drill_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_katakana_drill_trigger AFTER UPDATE OF last_drilled_at ON public.user_katakana_progress FOR EACH ROW WHEN ((new.last_drilled_at IS DISTINCT FROM old.last_drilled_at)) EXECUTE FUNCTION public.leaderboard_stats_on_drill();


--
-- Name: user_hiragana_rule_progress leaderboard_stats_new_hiragana_rule_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_hiragana_rule_trigger AFTER INSERT ON public.user_hiragana_rule_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_rule_card();


--
-- Name: user_hiragana_progress leaderboard_stats_new_hiragana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_hiragana_trigger AFTER INSERT ON public.user_hiragana_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_card();


--
-- Name: user_kanji_meaning_progress leaderboard_stats_new_kanji_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_kanji_trigger AFTER INSERT ON public.user_kanji_meaning_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_card();


--
-- Name: user_katakana_rule_progress leaderboard_stats_new_katakana_rule_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_katakana_rule_trigger AFTER INSERT ON public.user_katakana_rule_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_rule_card();


--
-- Name: user_katakana_progress leaderboard_stats_new_katakana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_katakana_trigger AFTER INSERT ON public.user_katakana_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_card();


--
-- Name: user_vocabulary_progress leaderboard_stats_new_vocab_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_new_vocab_trigger AFTER INSERT ON public.user_vocabulary_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_new_card();


--
-- Name: practice_logs leaderboard_stats_practice_answer_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_practice_answer_trigger AFTER INSERT ON public.practice_logs FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_practice_answer();


--
-- Name: user_reading_test_progress leaderboard_stats_reading_test_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_reading_test_trigger AFTER INSERT ON public.user_reading_test_progress FOR EACH ROW EXECUTE FUNCTION public.leaderboard_stats_on_reading_test();


--
-- Name: review_logs leaderboard_stats_review_insert_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_review_insert_trigger AFTER INSERT ON public.review_logs FOR EACH ROW WHEN ((new.undone = false)) EXECUTE FUNCTION public.leaderboard_stats_on_review_insert();


--
-- Name: review_logs leaderboard_stats_review_undo_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leaderboard_stats_review_undo_trigger AFTER UPDATE OF undone ON public.review_logs FOR EACH ROW WHEN (((old.undone = false) AND (new.undone = true))) EXECUTE FUNCTION public.leaderboard_stats_on_review_undo();


--
-- Name: user_study_settings normalize_enabled_levels_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_enabled_levels_trigger BEFORE INSERT OR UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.normalize_enabled_levels();


--
-- Name: users on_public_user_profile_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_public_user_profile_changed AFTER UPDATE OF display_name, avatar_url ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_public_user_profile_change();


--
-- Name: user_reading_test_progress reading_test_progress_activates_katakana_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reading_test_progress_activates_katakana_trigger AFTER INSERT OR UPDATE ON public.user_reading_test_progress FOR EACH ROW EXECUTE FUNCTION public.reading_test_progress_activates_katakana();


--
-- Name: user_reading_test_progress reading_test_progress_activates_standard_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reading_test_progress_activates_standard_trigger AFTER INSERT OR UPDATE ON public.user_reading_test_progress FOR EACH ROW EXECUTE FUNCTION public.reading_test_progress_activates_standard();


--
-- Name: user_reading_test_progress reading_test_progress_updates_status_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reading_test_progress_updates_status_trigger AFTER INSERT OR UPDATE ON public.user_reading_test_progress FOR EACH ROW EXECUTE FUNCTION public.reading_test_progress_updates_status();


--
-- Name: user_study_settings resume_katakana_on_kana_return_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resume_katakana_on_kana_return_trigger BEFORE UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.resume_katakana_on_kana_return();


--
-- Name: user_hiragana_progress set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_hiragana_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_kanji_meaning_progress set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_kanji_meaning_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_kanji_reading_progress set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_kanji_reading_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_katakana_progress set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_katakana_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_study_settings set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_vocabulary_progress set_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON public.user_vocabulary_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users set_users_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_users_updated_at_trigger BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();


--
-- Name: user_study_settings sync_new_vocab_per_day_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_new_vocab_per_day_trigger BEFORE INSERT OR UPDATE ON public.user_study_settings FOR EACH ROW EXECUTE FUNCTION public.sync_new_vocab_per_day();


--
-- Name: users sync_user_continent_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_user_continent_trigger BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_user_continent();


--
-- Name: user_hiragana_progress user_hiragana_progress_updates_achievements_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_hiragana_progress_updates_achievements_trigger AFTER INSERT OR UPDATE OF status ON public.user_hiragana_progress FOR EACH ROW EXECUTE FUNCTION public.user_hiragana_progress_updates_achievements();


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_updates_achievements_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_kanji_meaning_progress_updates_achievements_trigger AFTER INSERT OR UPDATE OF status ON public.user_kanji_meaning_progress FOR EACH ROW EXECUTE FUNCTION public.kanji_vocab_progress_updates_achievements();


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_updates_achievements_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_kanji_reading_progress_updates_achievements_trigger AFTER INSERT OR UPDATE OF status ON public.user_kanji_reading_progress FOR EACH ROW EXECUTE FUNCTION public.kanji_vocab_progress_updates_achievements();


--
-- Name: user_katakana_progress user_katakana_progress_updates_achievements_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_katakana_progress_updates_achievements_trigger AFTER INSERT OR UPDATE OF status ON public.user_katakana_progress FOR EACH ROW EXECUTE FUNCTION public.user_katakana_progress_updates_achievements();


--
-- Name: user_vocabulary_progress user_vocabulary_progress_updates_achievements_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_vocabulary_progress_updates_achievements_trigger AFTER INSERT OR UPDATE OF status ON public.user_vocabulary_progress FOR EACH ROW EXECUTE FUNCTION public.kanji_vocab_progress_updates_achievements();


--
-- Name: kanji_detail_words fk_kanji_detail_words_kanji; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_detail_words
    ADD CONSTRAINT fk_kanji_detail_words_kanji FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE;


--
-- Name: kanji_detail_words fk_kanji_detail_words_kanji_word; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_detail_words
    ADD CONSTRAINT fk_kanji_detail_words_kanji_word FOREIGN KEY (kanji_word_id) REFERENCES public.kanji_word(id) ON DELETE CASCADE;


--
-- Name: kanji_word fk_kanji_word_kanji; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_word
    ADD CONSTRAINT fk_kanji_word_kanji FOREIGN KEY (id_kanji) REFERENCES public.kanji(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: kanji_word fk_kanji_word_vocabulary; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanji_word
    ADD CONSTRAINT fk_kanji_word_vocabulary FOREIGN KEY (id_word) REFERENCES public.vocabulary(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leaderboard_daily_stats leaderboard_daily_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_daily_stats
    ADD CONSTRAINT leaderboard_daily_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: leaderboard_stats leaderboard_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_stats
    ADD CONSTRAINT leaderboard_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_hiragana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_hiragana_id_fkey FOREIGN KEY (hiragana_id) REFERENCES public.hiragana(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_kanji_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_kanji_id_fkey FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_katakana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_katakana_id_fkey FOREIGN KEY (katakana_id) REFERENCES public.katakana(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: practice_logs practice_logs_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_logs
    ADD CONSTRAINT practice_logs_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.vocabulary(id) ON DELETE CASCADE;


--
-- Name: review_logs review_logs_hiragana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_hiragana_id_fkey FOREIGN KEY (hiragana_id) REFERENCES public.hiragana(id) ON DELETE CASCADE;


--
-- Name: review_logs review_logs_kanji_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_kanji_id_fkey FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE;


--
-- Name: review_logs review_logs_katakana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_katakana_id_fkey FOREIGN KEY (katakana_id) REFERENCES public.katakana(id) ON DELETE CASCADE;


--
-- Name: review_logs review_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: review_logs review_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: review_logs review_logs_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_logs
    ADD CONSTRAINT review_logs_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.vocabulary(id) ON DELETE CASCADE;


--
-- Name: study_sessions study_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_status test_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_status
    ADD CONSTRAINT test_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_hiragana_progress user_hiragana_progress_hiragana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_progress
    ADD CONSTRAINT user_hiragana_progress_hiragana_id_fkey FOREIGN KEY (hiragana_id) REFERENCES public.hiragana(id) ON DELETE CASCADE;


--
-- Name: user_hiragana_progress user_hiragana_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_progress
    ADD CONSTRAINT user_hiragana_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_hiragana_progress user_hiragana_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_progress
    ADD CONSTRAINT user_hiragana_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_hiragana_rule_progress user_hiragana_rule_progress_hiragana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_rule_progress
    ADD CONSTRAINT user_hiragana_rule_progress_hiragana_id_fkey FOREIGN KEY (hiragana_id) REFERENCES public.hiragana(id) ON DELETE CASCADE;


--
-- Name: user_hiragana_rule_progress user_hiragana_rule_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_rule_progress
    ADD CONSTRAINT user_hiragana_rule_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_hiragana_rule_progress user_hiragana_rule_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hiragana_rule_progress
    ADD CONSTRAINT user_hiragana_rule_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_kanji_basics_progress user_kanji_basics_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_basics_progress
    ADD CONSTRAINT user_kanji_basics_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_kanji_basics_progress user_kanji_basics_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_basics_progress
    ADD CONSTRAINT user_kanji_basics_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_kanji_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_meaning_progress
    ADD CONSTRAINT user_kanji_meaning_progress_kanji_id_fkey FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE;


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_meaning_progress
    ADD CONSTRAINT user_kanji_meaning_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_kanji_meaning_progress user_kanji_meaning_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_meaning_progress
    ADD CONSTRAINT user_kanji_meaning_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_kanji_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_reading_progress
    ADD CONSTRAINT user_kanji_reading_progress_kanji_id_fkey FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE;


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_kanji_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_reading_progress
    ADD CONSTRAINT user_kanji_reading_progress_kanji_word_id_fkey FOREIGN KEY (kanji_word_id) REFERENCES public.kanji_word(id) ON DELETE CASCADE;


--
-- Name: user_kanji_reading_progress user_kanji_reading_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_kanji_reading_progress
    ADD CONSTRAINT user_kanji_reading_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_katakana_progress user_katakana_progress_katakana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_progress
    ADD CONSTRAINT user_katakana_progress_katakana_id_fkey FOREIGN KEY (katakana_id) REFERENCES public.katakana(id) ON DELETE CASCADE;


--
-- Name: user_katakana_progress user_katakana_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_progress
    ADD CONSTRAINT user_katakana_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_katakana_progress user_katakana_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_progress
    ADD CONSTRAINT user_katakana_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_katakana_rule_progress user_katakana_rule_progress_katakana_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_rule_progress
    ADD CONSTRAINT user_katakana_rule_progress_katakana_id_fkey FOREIGN KEY (katakana_id) REFERENCES public.katakana(id) ON DELETE CASCADE;


--
-- Name: user_katakana_rule_progress user_katakana_rule_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_rule_progress
    ADD CONSTRAINT user_katakana_rule_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_katakana_rule_progress user_katakana_rule_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_katakana_rule_progress
    ADD CONSTRAINT user_katakana_rule_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reading_test_attempts user_reading_test_attempts_draft_sentence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_attempts
    ADD CONSTRAINT user_reading_test_attempts_draft_sentence_id_fkey FOREIGN KEY (draft_sentence_id) REFERENCES public.test(id) ON DELETE SET NULL;


--
-- Name: user_reading_test_attempts user_reading_test_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_attempts
    ADD CONSTRAINT user_reading_test_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reading_test_progress user_reading_test_progress_sentence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_progress
    ADD CONSTRAINT user_reading_test_progress_sentence_id_fkey FOREIGN KEY (sentence_id) REFERENCES public.test(id) ON DELETE CASCADE;


--
-- Name: user_reading_test_progress user_reading_test_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reading_test_progress
    ADD CONSTRAINT user_reading_test_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_study_settings user_study_settings_leaderboard_alias_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_settings
    ADD CONSTRAINT user_study_settings_leaderboard_alias_id_fkey FOREIGN KEY (leaderboard_alias_id) REFERENCES public.leaderboard_aliases(id) ON DELETE SET NULL;


--
-- Name: user_study_settings user_study_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_study_settings
    ADD CONSTRAINT user_study_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_vocabulary_progress user_vocabulary_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vocabulary_progress
    ADD CONSTRAINT user_vocabulary_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE SET NULL;


--
-- Name: user_vocabulary_progress user_vocabulary_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vocabulary_progress
    ADD CONSTRAINT user_vocabulary_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_vocabulary_progress user_vocabulary_progress_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vocabulary_progress
    ADD CONSTRAINT user_vocabulary_progress_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.vocabulary(id) ON DELETE CASCADE;


--
-- Name: users users_country_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_country_fkey FOREIGN KEY (country) REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: free_lesson_leads Admins can update free_lesson_leads contacted; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update free_lesson_leads contacted" ON public.free_lesson_leads FOR UPDATE TO authenticated USING (COALESCE(( SELECT users.admin
   FROM public.users
  WHERE (users.id = ( SELECT auth.uid() AS uid))), false)) WITH CHECK (COALESCE(( SELECT users.admin
   FROM public.users
  WHERE (users.id = ( SELECT auth.uid() AS uid))), false));


--
-- Name: vocabulary Admins can update vocabulary jmdict_match_reviewed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update vocabulary jmdict_match_reviewed" ON public.vocabulary FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: users Admins can view all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all users" ON public.users FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: error_logs Admins can view error_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view error_logs" ON public.error_logs FOR SELECT TO authenticated USING (COALESCE(( SELECT users.admin
   FROM public.users
  WHERE (users.id = ( SELECT auth.uid() AS uid))), false));


--
-- Name: free_lesson_leads Admins can view free_lesson_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view free_lesson_leads" ON public.free_lesson_leads FOR SELECT TO authenticated USING (COALESCE(( SELECT users.admin
   FROM public.users
  WHERE (users.id = ( SELECT auth.uid() AS uid))), false));


--
-- Name: leaderboard_daily_stats Admins can view leaderboard_daily_stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view leaderboard_daily_stats" ON public.leaderboard_daily_stats FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: leaderboard_stats Admins can view leaderboard_stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view leaderboard_stats" ON public.leaderboard_stats FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: practice_logs Admins can view practice_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view practice_logs" ON public.practice_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: review_logs Admins can view review_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view review_logs" ON public.review_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: study_sessions Admins can view study_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view study_sessions" ON public.study_sessions FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: test_status Admins can view test_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view test_status" ON public.test_status FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_achievements Admins can view user_achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_achievements" ON public.user_achievements FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_hiragana_progress Admins can view user_hiragana_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_hiragana_progress" ON public.user_hiragana_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_hiragana_rule_progress Admins can view user_hiragana_rule_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_hiragana_rule_progress" ON public.user_hiragana_rule_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_kanji_basics_progress Admins can view user_kanji_basics_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_kanji_basics_progress" ON public.user_kanji_basics_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_kanji_meaning_progress Admins can view user_kanji_meaning_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_kanji_meaning_progress" ON public.user_kanji_meaning_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_kanji_reading_progress Admins can view user_kanji_reading_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_kanji_reading_progress" ON public.user_kanji_reading_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_katakana_progress Admins can view user_katakana_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_katakana_progress" ON public.user_katakana_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_katakana_rule_progress Admins can view user_katakana_rule_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_katakana_rule_progress" ON public.user_katakana_rule_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_reading_test_progress Admins can view user_reading_test_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_reading_test_progress" ON public.user_reading_test_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_study_settings Admins can view user_study_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_study_settings" ON public.user_study_settings FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_vocabulary_progress Admins can view user_vocabulary_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view user_vocabulary_progress" ON public.user_vocabulary_progress FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: users Allow individual updates to own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual updates to own profile" ON public.users FOR UPDATE USING (((( SELECT auth.uid() AS uid) = id) AND (pending_deletion_at IS NULL))) WITH CHECK (((( SELECT auth.uid() AS uid) = id) AND (pending_deletion_at IS NULL)));


--
-- Name: free_lesson_leads Anyone can submit a free lesson lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit a free lesson lead" ON public.free_lesson_leads FOR INSERT TO anon WITH CHECK (true);


--
-- Name: countries Authenticated users can read countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read countries" ON public.countries FOR SELECT TO authenticated USING (true);


--
-- Name: hiragana Authenticated users can read hiragana; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read hiragana" ON public.hiragana FOR SELECT TO authenticated USING (true);


--
-- Name: kana_rule_labels Authenticated users can read kana_rule_labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read kana_rule_labels" ON public.kana_rule_labels FOR SELECT TO authenticated USING (true);


--
-- Name: kanji Authenticated users can read kanji; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read kanji" ON public.kanji FOR SELECT TO authenticated USING (true);


--
-- Name: kanji_detail_words Authenticated users can read kanji_detail_words; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read kanji_detail_words" ON public.kanji_detail_words FOR SELECT TO authenticated USING (true);


--
-- Name: kanji_rules Authenticated users can read kanji_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read kanji_rules" ON public.kanji_rules FOR SELECT TO authenticated USING (true);


--
-- Name: kanji_word Authenticated users can read kanji_word; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read kanji_word" ON public.kanji_word FOR SELECT TO authenticated USING (true);


--
-- Name: katakana Authenticated users can read katakana; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read katakana" ON public.katakana FOR SELECT TO authenticated USING (true);


--
-- Name: leaderboard_aliases Authenticated users can read leaderboard_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read leaderboard_aliases" ON public.leaderboard_aliases FOR SELECT TO authenticated USING (true);


--
-- Name: test Authenticated users can read test; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read test" ON public.test FOR SELECT TO authenticated USING (true);


--
-- Name: vocabulary Authenticated users can read vocabulary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read vocabulary" ON public.vocabulary FOR SELECT TO authenticated USING (true);


--
-- Name: error_logs Users can insert own error_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own error_logs" ON public.error_logs FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = error_logs.user_id) AND (users.email = ANY (ARRAY['cezarateodorescu8@gmail.com'::text, 'bluekitsunebi@gmail.com'::text, 'vici.sensei@gmail.com'::text, 'vicentiuchesca@gmail.com'::text]))))))));


--
-- Name: users Users can view their own profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile." ON public.users FOR SELECT USING (((( SELECT auth.uid() AS uid) = id) AND (pending_deletion_at IS NULL)));


--
-- Name: practice_logs Users manage own practice_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own practice_logs" ON public.practice_logs USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: review_logs Users manage own review_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own review_logs" ON public.review_logs USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: study_sessions Users manage own study_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own study_sessions" ON public.study_sessions USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_hiragana_progress Users manage own user_hiragana_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_hiragana_progress" ON public.user_hiragana_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_hiragana_rule_progress Users manage own user_hiragana_rule_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_hiragana_rule_progress" ON public.user_hiragana_rule_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_kanji_basics_progress Users manage own user_kanji_basics_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_kanji_basics_progress" ON public.user_kanji_basics_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_kanji_meaning_progress Users manage own user_kanji_meaning_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_kanji_meaning_progress" ON public.user_kanji_meaning_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_kanji_reading_progress Users manage own user_kanji_reading_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_kanji_reading_progress" ON public.user_kanji_reading_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_katakana_progress Users manage own user_katakana_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_katakana_progress" ON public.user_katakana_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_katakana_rule_progress Users manage own user_katakana_rule_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_katakana_rule_progress" ON public.user_katakana_rule_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_reading_test_attempts Users manage own user_reading_test_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_reading_test_attempts" ON public.user_reading_test_attempts USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_reading_test_progress Users manage own user_reading_test_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_reading_test_progress" ON public.user_reading_test_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_study_settings Users manage own user_study_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_study_settings" ON public.user_study_settings USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_vocabulary_progress Users manage own user_vocabulary_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own user_vocabulary_progress" ON public.user_vocabulary_progress USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: test_status Users view own test_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own test_status" ON public.test_status FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: user_achievements Users view own user_achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own user_achievements" ON public.user_achievements FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) AND public.account_is_active(user_id)));


--
-- Name: account_deletion_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

--
-- Name: countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: free_lesson_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.free_lesson_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: hiragana; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hiragana ENABLE ROW LEVEL SECURITY;

--
-- Name: kana_rule_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kana_rule_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: kanji; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanji ENABLE ROW LEVEL SECURITY;

--
-- Name: kanji_detail_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanji_detail_words ENABLE ROW LEVEL SECURITY;

--
-- Name: kanji_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanji_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: kanji_word; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanji_word ENABLE ROW LEVEL SECURITY;

--
-- Name: katakana; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.katakana ENABLE ROW LEVEL SECURITY;

--
-- Name: leaderboard_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leaderboard_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: leaderboard_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leaderboard_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: leaderboard_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leaderboard_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: morphology_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.morphology_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: practice_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: review_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: study_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: test; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test ENABLE ROW LEVEL SECURITY;

--
-- Name: test_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_status ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: user_hiragana_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_hiragana_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_hiragana_rule_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_hiragana_rule_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_kanji_basics_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_basics_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_kanji_meaning_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_meaning_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_kanji_reading_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_kanji_reading_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_katakana_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_katakana_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_katakana_rule_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_katakana_rule_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reading_test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_reading_test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reading_test_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_reading_test_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_study_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_study_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_vocabulary_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_vocabulary_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vocabulary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION account_is_active(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.account_is_active(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.account_is_active(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.account_is_active(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION acknowledge_achievements(p_keys text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.acknowledge_achievements(p_keys text[]) TO anon;
GRANT ALL ON FUNCTION public.acknowledge_achievements(p_keys text[]) TO authenticated;
GRANT ALL ON FUNCTION public.acknowledge_achievements(p_keys text[]) TO service_role;


--
-- Name: FUNCTION apply_timezone_preference(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_timezone_preference() TO anon;
GRANT ALL ON FUNCTION public.apply_timezone_preference() TO authenticated;
GRANT ALL ON FUNCTION public.apply_timezone_preference() TO service_role;


--
-- Name: FUNCTION assign_leaderboard_alias(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_leaderboard_alias() TO anon;
GRANT ALL ON FUNCTION public.assign_leaderboard_alias() TO authenticated;
GRANT ALL ON FUNCTION public.assign_leaderboard_alias() TO service_role;


--
-- Name: FUNCTION award_achievement(p_user_id uuid, p_key text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_achievement(p_user_id uuid, p_key text) TO anon;
GRANT ALL ON FUNCTION public.award_achievement(p_user_id uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.award_achievement(p_user_id uuid, p_key text) TO service_role;


--
-- Name: FUNCTION cancel_pending_account_deletion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_pending_account_deletion() TO anon;
GRANT ALL ON FUNCTION public.cancel_pending_account_deletion() TO authenticated;
GRANT ALL ON FUNCTION public.cancel_pending_account_deletion() TO service_role;


--
-- Name: FUNCTION check_and_advance_jlpt_level(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_and_advance_jlpt_level(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_and_advance_jlpt_level(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_and_advance_jlpt_level(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION clamp_new_card_caps(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clamp_new_card_caps() TO anon;
GRANT ALL ON FUNCTION public.clamp_new_card_caps() TO authenticated;
GRANT ALL ON FUNCTION public.clamp_new_card_caps() TO service_role;


--
-- Name: FUNCTION complete_vocab_batch(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION compute_review_result(p_status text, p_ease_factor numeric, p_interval_days integer, p_repetitions integer, p_lapses integer, p_learning_step integer, p_rating smallint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_review_result(p_status text, p_ease_factor numeric, p_interval_days integer, p_repetitions integer, p_lapses integer, p_learning_step integer, p_rating smallint) TO anon;
GRANT ALL ON FUNCTION public.compute_review_result(p_status text, p_ease_factor numeric, p_interval_days integer, p_repetitions integer, p_lapses integer, p_learning_step integer, p_rating smallint) TO authenticated;
GRANT ALL ON FUNCTION public.compute_review_result(p_status text, p_ease_factor numeric, p_interval_days integer, p_repetitions integer, p_lapses integer, p_learning_step integer, p_rating smallint) TO service_role;


--
-- Name: FUNCTION end_study_session(p_user_id uuid, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.end_study_session(p_user_id uuid, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.end_study_session(p_user_id uuid, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.end_study_session(p_user_id uuid, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION enforce_gmail_email(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_gmail_email() TO anon;
GRANT ALL ON FUNCTION public.enforce_gmail_email() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_gmail_email() TO service_role;


--
-- Name: FUNCTION enforce_katakana_requires_hiragana_mastered(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_katakana_requires_hiragana_mastered() TO anon;
GRANT ALL ON FUNCTION public.enforce_katakana_requires_hiragana_mastered() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_katakana_requires_hiragana_mastered() TO service_role;


--
-- Name: FUNCTION evaluate_kana_achievements(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.evaluate_kana_achievements(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.evaluate_kana_achievements(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.evaluate_kana_achievements(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION evaluate_kanji_vocab_achievements(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.evaluate_kanji_vocab_achievements(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.evaluate_kanji_vocab_achievements(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.evaluate_kanji_vocab_achievements(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_admin_dashboard_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_dashboard_stats() TO anon;
GRANT ALL ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_dashboard_stats() TO service_role;


--
-- Name: FUNCTION get_admin_student_roster(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_student_roster() TO anon;
GRANT ALL ON FUNCTION public.get_admin_student_roster() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_student_roster() TO service_role;


--
-- Name: FUNCTION get_admin_student_streaks(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_student_streaks(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_admin_student_streaks(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_student_streaks(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_daily_review_budget(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_daily_review_budget(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_daily_review_budget(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_daily_review_budget(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[]) TO anon;
GRANT ALL ON FUNCTION public.get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[]) TO service_role;


--
-- Name: FUNCTION get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[]) TO service_role;


--
-- Name: FUNCTION get_hiragana_rule_forecast(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_hiragana_rule_forecast(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_hiragana_rule_forecast(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_hiragana_rule_forecast(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_kanji_detail_words(p_kanji_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_kanji_detail_words(p_kanji_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_kanji_detail_words(p_kanji_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_kanji_detail_words(p_kanji_id bigint) TO service_role;


--
-- Name: FUNCTION get_kanji_detail_words_batch(p_kanji_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_kanji_detail_words_batch(p_kanji_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.get_kanji_detail_words_batch(p_kanji_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_kanji_detail_words_batch(p_kanji_ids bigint[]) TO service_role;


--
-- Name: FUNCTION get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO service_role;


--
-- Name: FUNCTION get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[]) TO service_role;


--
-- Name: FUNCTION get_katakana_rule_forecast(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_katakana_rule_forecast(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_katakana_rule_forecast(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_katakana_rule_forecast(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid) TO service_role;


--
-- Name: FUNCTION get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid) TO service_role;


--
-- Name: FUNCTION get_leaderboard_streak(p_limit integer, p_viewer_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid) TO service_role;


--
-- Name: FUNCTION get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid) TO service_role;


--
-- Name: FUNCTION get_level_progress(p_user_id uuid, p_level text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_level_progress(p_user_id uuid, p_level text) TO anon;
GRANT ALL ON FUNCTION public.get_level_progress(p_user_id uuid, p_level text) TO authenticated;
GRANT ALL ON FUNCTION public.get_level_progress(p_user_id uuid, p_level text) TO service_role;


--
-- Name: FUNCTION get_new_card_caps(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_card_caps() TO anon;
GRANT ALL ON FUNCTION public.get_new_card_caps() TO authenticated;
GRANT ALL ON FUNCTION public.get_new_card_caps() TO service_role;


--
-- Name: FUNCTION get_new_hiragana_candidates(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_new_kanji_basics_candidates(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_kanji_basics_candidates(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_new_kanji_basics_candidates(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_kanji_basics_candidates(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO service_role;


--
-- Name: FUNCTION get_new_katakana_candidates(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_katakana_candidates(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_katakana_candidates(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_katakana_candidates(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer) TO service_role;


--
-- Name: FUNCTION get_next_due(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_next_due(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_next_due(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_next_due(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_retention_rate(p_user_id uuid, p_window_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_retention_rate(p_user_id uuid, p_window_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_retention_rate(p_user_id uuid, p_window_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_retention_rate(p_user_id uuid, p_window_days integer) TO service_role;


--
-- Name: FUNCTION get_review_activity(p_user_id uuid, p_timezone text, p_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_review_activity(p_user_id uuid, p_timezone text, p_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_review_activity(p_user_id uuid, p_timezone text, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_review_activity(p_user_id uuid, p_timezone text, p_days integer) TO service_role;


--
-- Name: FUNCTION get_review_streak(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_review_streak(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_review_streak(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_review_streak(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_review_streak_record(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_review_streak_record(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_review_streak_record(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_review_streak_record(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO anon;
GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO service_role;


--
-- Name: FUNCTION get_servable_due_rows(p_user_id uuid, p_enabled_levels text[], p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_servable_due_rows(p_user_id uuid, p_enabled_levels text[], p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_servable_due_rows(p_user_id uuid, p_enabled_levels text[], p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_servable_due_rows(p_user_id uuid, p_enabled_levels text[], p_timezone text) TO service_role;


--
-- Name: FUNCTION get_server_time(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_server_time() TO anon;
GRANT ALL ON FUNCTION public.get_server_time() TO authenticated;
GRANT ALL ON FUNCTION public.get_server_time() TO service_role;


--
-- Name: FUNCTION get_streak_active_days(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_streak_active_days(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_streak_active_days(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_streak_active_days(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_streak_run(p_user_id uuid, p_timezone text, p_as_of date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_streak_run(p_user_id uuid, p_timezone text, p_as_of date) TO anon;
GRANT ALL ON FUNCTION public.get_streak_run(p_user_id uuid, p_timezone text, p_as_of date) TO authenticated;
GRANT ALL ON FUNCTION public.get_streak_run(p_user_id uuid, p_timezone text, p_as_of date) TO service_role;


--
-- Name: FUNCTION get_student_daily_activity(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_student_daily_activity(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_student_daily_activity(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_student_daily_activity(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_student_new_card_progress(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_student_new_card_progress(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_student_new_card_progress(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_student_new_card_progress(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_today_activity_counts(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_today_activity_counts(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_today_activity_counts(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_today_activity_counts(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION get_vocab_meaning_pool(p_word text, p_kana_reading text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vocab_meaning_pool(p_word text, p_kana_reading text) TO anon;
GRANT ALL ON FUNCTION public.get_vocab_meaning_pool(p_word text, p_kana_reading text) TO authenticated;
GRANT ALL ON FUNCTION public.get_vocab_meaning_pool(p_word text, p_kana_reading text) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_public_user_profile_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_public_user_profile_change() TO anon;
GRANT ALL ON FUNCTION public.handle_public_user_profile_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_public_user_profile_change() TO service_role;


--
-- Name: FUNCTION handle_user_email_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_user_email_change() TO anon;
GRANT ALL ON FUNCTION public.handle_user_email_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_user_email_change() TO service_role;


--
-- Name: FUNCTION handle_user_metadata_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_user_metadata_change() TO anon;
GRANT ALL ON FUNCTION public.handle_user_metadata_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_user_metadata_change() TO service_role;


--
-- Name: FUNCTION hiragana_auto_activate_katakana(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hiragana_auto_activate_katakana() TO anon;
GRANT ALL ON FUNCTION public.hiragana_auto_activate_katakana() TO authenticated;
GRANT ALL ON FUNCTION public.hiragana_auto_activate_katakana() TO service_role;


--
-- Name: FUNCTION hiragana_regression_disables_katakana(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hiragana_regression_disables_katakana() TO anon;
GRANT ALL ON FUNCTION public.hiragana_regression_disables_katakana() TO authenticated;
GRANT ALL ON FUNCTION public.hiragana_regression_disables_katakana() TO service_role;


--
-- Name: FUNCTION immutable_array_to_string(text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.immutable_array_to_string(text[]) TO anon;
GRANT ALL ON FUNCTION public.immutable_array_to_string(text[]) TO authenticated;
GRANT ALL ON FUNCTION public.immutable_array_to_string(text[]) TO service_role;


--
-- Name: FUNCTION introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_hiragana_examples(p_user_id uuid, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_hiragana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_hiragana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_hiragana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_kanji_basics(p_user_id uuid, p_step smallint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_katakana_examples(p_user_id uuid, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_katakana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_katakana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_katakana_examples(p_user_id uuid, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION kanji_vocab_progress_updates_achievements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kanji_vocab_progress_updates_achievements() TO anon;
GRANT ALL ON FUNCTION public.kanji_vocab_progress_updates_achievements() TO authenticated;
GRANT ALL ON FUNCTION public.kanji_vocab_progress_updates_achievements() TO service_role;


--
-- Name: FUNCTION katakana_auto_activate_standard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.katakana_auto_activate_standard() TO anon;
GRANT ALL ON FUNCTION public.katakana_auto_activate_standard() TO authenticated;
GRANT ALL ON FUNCTION public.katakana_auto_activate_standard() TO service_role;


--
-- Name: FUNCTION leaderboard_bump_streak(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_day date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_bump_streak(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_day date) TO anon;
GRANT ALL ON FUNCTION public.leaderboard_bump_streak(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_day date) TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_bump_streak(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_day date) TO service_role;


--
-- Name: FUNCTION leaderboard_period_end(p_period text, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_period_end(p_period text, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.leaderboard_period_end(p_period text, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_period_end(p_period text, p_timezone text) TO service_role;


--
-- Name: FUNCTION leaderboard_period_start(p_period text, p_today date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_period_start(p_period text, p_today date) TO anon;
GRANT ALL ON FUNCTION public.leaderboard_period_start(p_period text, p_today date) TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_period_start(p_period text, p_today date) TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_drill(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_drill() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_drill() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_drill() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_new_card(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_card() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_card() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_card() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_new_rule_card(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_rule_card() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_rule_card() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_new_rule_card() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_practice_answer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_practice_answer() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_practice_answer() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_practice_answer() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_reading_test(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_reading_test() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_reading_test() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_reading_test() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_review_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_insert() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_insert() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_insert() TO service_role;


--
-- Name: FUNCTION leaderboard_stats_on_review_undo(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_undo() TO anon;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_undo() TO authenticated;
GRANT ALL ON FUNCTION public.leaderboard_stats_on_review_undo() TO service_role;


--
-- Name: FUNCTION normalize_enabled_levels(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_enabled_levels() TO anon;
GRANT ALL ON FUNCTION public.normalize_enabled_levels() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_enabled_levels() TO service_role;


--
-- Name: FUNCTION reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position integer) TO anon;
GRANT ALL ON FUNCTION public.reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position integer) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position integer) TO service_role;


--
-- Name: FUNCTION reading_test_cta_state(p_user_id uuid, p_test_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_cta_state(p_user_id uuid, p_test_type text) TO anon;
GRANT ALL ON FUNCTION public.reading_test_cta_state(p_user_id uuid, p_test_type text) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_cta_state(p_user_id uuid, p_test_type text) TO service_role;


--
-- Name: FUNCTION reading_test_current_attempt(p_user_id uuid, p_test_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_current_attempt(p_user_id uuid, p_test_type text) TO anon;
GRANT ALL ON FUNCTION public.reading_test_current_attempt(p_user_id uuid, p_test_type text) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_current_attempt(p_user_id uuid, p_test_type text) TO service_role;


--
-- Name: FUNCTION reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[]) TO anon;
GRANT ALL ON FUNCTION public.reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[]) TO service_role;


--
-- Name: FUNCTION reading_test_passed(p_user_id uuid, p_test_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_passed(p_user_id uuid, p_test_type text) TO anon;
GRANT ALL ON FUNCTION public.reading_test_passed(p_user_id uuid, p_test_type text) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_passed(p_user_id uuid, p_test_type text) TO service_role;


--
-- Name: FUNCTION reading_test_progress_activates_katakana(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_progress_activates_katakana() TO anon;
GRANT ALL ON FUNCTION public.reading_test_progress_activates_katakana() TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_progress_activates_katakana() TO service_role;


--
-- Name: FUNCTION reading_test_progress_activates_standard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_progress_activates_standard() TO anon;
GRANT ALL ON FUNCTION public.reading_test_progress_activates_standard() TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_progress_activates_standard() TO service_role;


--
-- Name: FUNCTION reading_test_progress_updates_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_progress_updates_status() TO anon;
GRANT ALL ON FUNCTION public.reading_test_progress_updates_status() TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_progress_updates_status() TO service_role;


--
-- Name: FUNCTION reading_test_retry_wrong(p_user_id uuid, p_test_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_retry_wrong(p_user_id uuid, p_test_type text) TO anon;
GRANT ALL ON FUNCTION public.reading_test_retry_wrong(p_user_id uuid, p_test_type text) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_retry_wrong(p_user_id uuid, p_test_type text) TO service_role;


--
-- Name: FUNCTION reading_test_submit_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint, p_correct boolean, p_user_answer text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_submit_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint, p_correct boolean, p_user_answer text) TO anon;
GRANT ALL ON FUNCTION public.reading_test_submit_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint, p_correct boolean, p_user_answer text) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_submit_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint, p_correct boolean, p_user_answer text) TO service_role;


--
-- Name: FUNCTION reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint) TO anon;
GRANT ALL ON FUNCTION public.reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id bigint) TO service_role;


--
-- Name: FUNCTION rebuild_kanji_detail_words(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rebuild_kanji_detail_words() TO anon;
GRANT ALL ON FUNCTION public.rebuild_kanji_detail_words() TO authenticated;
GRANT ALL ON FUNCTION public.rebuild_kanji_detail_words() TO service_role;


--
-- Name: FUNCTION record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text) TO service_role;


--
-- Name: FUNCTION record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text) TO service_role;


--
-- Name: FUNCTION reroll_leaderboard_alias(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reroll_leaderboard_alias() TO anon;
GRANT ALL ON FUNCTION public.reroll_leaderboard_alias() TO authenticated;
GRANT ALL ON FUNCTION public.reroll_leaderboard_alias() TO service_role;


--
-- Name: FUNCTION resolve_user_timezone(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_user_timezone(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.resolve_user_timezone(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_user_timezone(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION resume_katakana_on_kana_return(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resume_katakana_on_kana_return() TO anon;
GRANT ALL ON FUNCTION public.resume_katakana_on_kana_return() TO authenticated;
GRANT ALL ON FUNCTION public.resume_katakana_on_kana_return() TO service_role;


--
-- Name: FUNCTION search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_user_timezone(p_user_id uuid, p_timezone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_user_timezone(p_user_id uuid, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.set_user_timezone(p_user_id uuid, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.set_user_timezone(p_user_id uuid, p_timezone text) TO service_role;


--
-- Name: FUNCTION set_users_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_users_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_users_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_users_updated_at() TO service_role;


--
-- Name: FUNCTION streak_display_count(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_today date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.streak_display_count(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_today date) TO anon;
GRANT ALL ON FUNCTION public.streak_display_count(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_today date) TO authenticated;
GRANT ALL ON FUNCTION public.streak_display_count(p_current_streak integer, p_last_active_date date, p_recent_inactive date[], p_today date) TO service_role;


--
-- Name: FUNCTION streak_free_days_per_week(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.streak_free_days_per_week() TO anon;
GRANT ALL ON FUNCTION public.streak_free_days_per_week() TO authenticated;
GRANT ALL ON FUNCTION public.streak_free_days_per_week() TO service_role;


--
-- Name: FUNCTION study_day(p_at timestamp with time zone, p_timezone text, p_offset_hours integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.study_day(p_at timestamp with time zone, p_timezone text, p_offset_hours integer) TO anon;
GRANT ALL ON FUNCTION public.study_day(p_at timestamp with time zone, p_timezone text, p_offset_hours integer) TO authenticated;
GRANT ALL ON FUNCTION public.study_day(p_at timestamp with time zone, p_timezone text, p_offset_hours integer) TO service_role;


--
-- Name: FUNCTION study_day_bounds(p_timezone text, p_offset_hours integer, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.study_day_bounds(p_timezone text, p_offset_hours integer, p_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.study_day_bounds(p_timezone text, p_offset_hours integer, p_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.study_day_bounds(p_timezone text, p_offset_hours integer, p_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION study_day_range(p_day date, p_timezone text, p_offset_hours integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.study_day_range(p_day date, p_timezone text, p_offset_hours integer) TO anon;
GRANT ALL ON FUNCTION public.study_day_range(p_day date, p_timezone text, p_offset_hours integer) TO authenticated;
GRANT ALL ON FUNCTION public.study_day_range(p_day date, p_timezone text, p_offset_hours integer) TO service_role;


--
-- Name: FUNCTION submit_review(p_user_id uuid, p_exercise_type text, p_rating smallint, p_kanji_id bigint, p_word_id bigint, p_kanji_word_id bigint, p_hiragana_id bigint, p_katakana_id bigint, p_user_answer text, p_session_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_review(p_user_id uuid, p_exercise_type text, p_rating smallint, p_kanji_id bigint, p_word_id bigint, p_kanji_word_id bigint, p_hiragana_id bigint, p_katakana_id bigint, p_user_answer text, p_session_id bigint) TO anon;
GRANT ALL ON FUNCTION public.submit_review(p_user_id uuid, p_exercise_type text, p_rating smallint, p_kanji_id bigint, p_word_id bigint, p_kanji_word_id bigint, p_hiragana_id bigint, p_katakana_id bigint, p_user_answer text, p_session_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.submit_review(p_user_id uuid, p_exercise_type text, p_rating smallint, p_kanji_id bigint, p_word_id bigint, p_kanji_word_id bigint, p_hiragana_id bigint, p_katakana_id bigint, p_user_answer text, p_session_id bigint) TO service_role;


--
-- Name: FUNCTION sync_new_vocab_per_day(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_new_vocab_per_day() TO anon;
GRANT ALL ON FUNCTION public.sync_new_vocab_per_day() TO authenticated;
GRANT ALL ON FUNCTION public.sync_new_vocab_per_day() TO service_role;


--
-- Name: FUNCTION sync_user_continent(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_user_continent() TO anon;
GRANT ALL ON FUNCTION public.sync_user_continent() TO authenticated;
GRANT ALL ON FUNCTION public.sync_user_continent() TO service_role;


--
-- Name: FUNCTION undo_review(p_user_id uuid, p_review_log_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.undo_review(p_user_id uuid, p_review_log_id bigint) TO anon;
GRANT ALL ON FUNCTION public.undo_review(p_user_id uuid, p_review_log_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.undo_review(p_user_id uuid, p_review_log_id bigint) TO service_role;


--
-- Name: FUNCTION user_hiragana_progress_updates_achievements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_hiragana_progress_updates_achievements() TO anon;
GRANT ALL ON FUNCTION public.user_hiragana_progress_updates_achievements() TO authenticated;
GRANT ALL ON FUNCTION public.user_hiragana_progress_updates_achievements() TO service_role;


--
-- Name: FUNCTION user_katakana_progress_updates_achievements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_katakana_progress_updates_achievements() TO anon;
GRANT ALL ON FUNCTION public.user_katakana_progress_updates_achievements() TO authenticated;
GRANT ALL ON FUNCTION public.user_katakana_progress_updates_achievements() TO service_role;


--
-- Name: TABLE vocabulary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vocabulary TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.vocabulary TO authenticated;
GRANT ALL ON TABLE public.vocabulary TO service_role;


--
-- Name: COLUMN vocabulary.short_meaning; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(short_meaning) ON TABLE public.vocabulary TO authenticated;


--
-- Name: FUNCTION vocabulary_primary_meanings(v public.vocabulary); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vocabulary_primary_meanings(v public.vocabulary) TO anon;
GRANT ALL ON FUNCTION public.vocabulary_primary_meanings(v public.vocabulary) TO authenticated;
GRANT ALL ON FUNCTION public.vocabulary_primary_meanings(v public.vocabulary) TO service_role;


--
-- Name: TABLE account_deletion_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_deletion_log TO anon;
GRANT ALL ON TABLE public.account_deletion_log TO authenticated;
GRANT ALL ON TABLE public.account_deletion_log TO service_role;


--
-- Name: SEQUENCE account_deletion_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.account_deletion_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.account_deletion_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.account_deletion_log_id_seq TO service_role;


--
-- Name: TABLE countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.countries TO anon;
GRANT ALL ON TABLE public.countries TO authenticated;
GRANT ALL ON TABLE public.countries TO service_role;


--
-- Name: TABLE error_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.error_logs TO anon;
GRANT ALL ON TABLE public.error_logs TO authenticated;
GRANT ALL ON TABLE public.error_logs TO service_role;


--
-- Name: SEQUENCE error_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.error_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.error_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.error_logs_id_seq TO service_role;


--
-- Name: TABLE free_lesson_leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.free_lesson_leads TO service_role;
GRANT INSERT ON TABLE public.free_lesson_leads TO anon;
GRANT SELECT ON TABLE public.free_lesson_leads TO authenticated;


--
-- Name: COLUMN free_lesson_leads.contacted; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(contacted) ON TABLE public.free_lesson_leads TO authenticated;


--
-- Name: SEQUENCE free_lesson_leads_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.free_lesson_leads_id_seq TO anon;
GRANT ALL ON SEQUENCE public.free_lesson_leads_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.free_lesson_leads_id_seq TO service_role;


--
-- Name: TABLE hiragana; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hiragana TO anon;
GRANT ALL ON TABLE public.hiragana TO authenticated;
GRANT ALL ON TABLE public.hiragana TO service_role;


--
-- Name: SEQUENCE hiragana_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.hiragana_id_seq TO anon;
GRANT ALL ON SEQUENCE public.hiragana_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.hiragana_id_seq TO service_role;


--
-- Name: TABLE kana_rule_labels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kana_rule_labels TO anon;
GRANT ALL ON TABLE public.kana_rule_labels TO authenticated;
GRANT ALL ON TABLE public.kana_rule_labels TO service_role;


--
-- Name: TABLE kanji; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanji TO anon;
GRANT ALL ON TABLE public.kanji TO authenticated;
GRANT ALL ON TABLE public.kanji TO service_role;


--
-- Name: TABLE kanji_detail_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanji_detail_words TO anon;
GRANT ALL ON TABLE public.kanji_detail_words TO authenticated;
GRANT ALL ON TABLE public.kanji_detail_words TO service_role;


--
-- Name: TABLE kanji_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanji_rules TO anon;
GRANT ALL ON TABLE public.kanji_rules TO authenticated;
GRANT ALL ON TABLE public.kanji_rules TO service_role;


--
-- Name: SEQUENCE kanji_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.kanji_rules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.kanji_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.kanji_rules_id_seq TO service_role;


--
-- Name: TABLE kanji_word; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kanji_word TO anon;
GRANT ALL ON TABLE public.kanji_word TO authenticated;
GRANT ALL ON TABLE public.kanji_word TO service_role;


--
-- Name: TABLE katakana; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.katakana TO anon;
GRANT ALL ON TABLE public.katakana TO authenticated;
GRANT ALL ON TABLE public.katakana TO service_role;


--
-- Name: SEQUENCE katakana_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.katakana_id_seq TO anon;
GRANT ALL ON SEQUENCE public.katakana_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.katakana_id_seq TO service_role;


--
-- Name: TABLE leaderboard_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leaderboard_aliases TO anon;
GRANT ALL ON TABLE public.leaderboard_aliases TO authenticated;
GRANT ALL ON TABLE public.leaderboard_aliases TO service_role;


--
-- Name: SEQUENCE leaderboard_aliases_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.leaderboard_aliases_id_seq TO anon;
GRANT ALL ON SEQUENCE public.leaderboard_aliases_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.leaderboard_aliases_id_seq TO service_role;


--
-- Name: TABLE leaderboard_daily_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leaderboard_daily_stats TO anon;
GRANT ALL ON TABLE public.leaderboard_daily_stats TO authenticated;
GRANT ALL ON TABLE public.leaderboard_daily_stats TO service_role;


--
-- Name: TABLE leaderboard_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leaderboard_stats TO anon;
GRANT ALL ON TABLE public.leaderboard_stats TO authenticated;
GRANT ALL ON TABLE public.leaderboard_stats TO service_role;


--
-- Name: TABLE morphology_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.morphology_rules TO anon;
GRANT ALL ON TABLE public.morphology_rules TO authenticated;
GRANT ALL ON TABLE public.morphology_rules TO service_role;


--
-- Name: TABLE practice_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.practice_logs TO anon;
GRANT ALL ON TABLE public.practice_logs TO authenticated;
GRANT ALL ON TABLE public.practice_logs TO service_role;


--
-- Name: SEQUENCE practice_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.practice_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.practice_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.practice_logs_id_seq TO service_role;


--
-- Name: TABLE test; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test TO anon;
GRANT ALL ON TABLE public.test TO authenticated;
GRANT ALL ON TABLE public.test TO service_role;


--
-- Name: SEQUENCE reading_test_sentences_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.reading_test_sentences_id_seq TO anon;
GRANT ALL ON SEQUENCE public.reading_test_sentences_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.reading_test_sentences_id_seq TO service_role;


--
-- Name: TABLE review_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.review_logs TO anon;
GRANT ALL ON TABLE public.review_logs TO authenticated;
GRANT ALL ON TABLE public.review_logs TO service_role;


--
-- Name: SEQUENCE review_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.review_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.review_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.review_logs_id_seq TO service_role;


--
-- Name: TABLE study_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.study_sessions TO anon;
GRANT ALL ON TABLE public.study_sessions TO authenticated;
GRANT ALL ON TABLE public.study_sessions TO service_role;


--
-- Name: SEQUENCE study_sessions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.study_sessions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.study_sessions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.study_sessions_id_seq TO service_role;


--
-- Name: TABLE test_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_status TO anon;
GRANT ALL ON TABLE public.test_status TO authenticated;
GRANT ALL ON TABLE public.test_status TO service_role;


--
-- Name: TABLE user_achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_achievements TO anon;
GRANT ALL ON TABLE public.user_achievements TO authenticated;
GRANT ALL ON TABLE public.user_achievements TO service_role;


--
-- Name: SEQUENCE user_achievements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_achievements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_achievements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_achievements_id_seq TO service_role;


--
-- Name: SEQUENCE user_badges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_badges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_badges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_badges_id_seq TO service_role;


--
-- Name: TABLE user_hiragana_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_hiragana_progress TO anon;
GRANT ALL ON TABLE public.user_hiragana_progress TO authenticated;
GRANT ALL ON TABLE public.user_hiragana_progress TO service_role;


--
-- Name: SEQUENCE user_hiragana_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_hiragana_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_hiragana_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_hiragana_progress_id_seq TO service_role;


--
-- Name: TABLE user_hiragana_rule_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_hiragana_rule_progress TO anon;
GRANT ALL ON TABLE public.user_hiragana_rule_progress TO authenticated;
GRANT ALL ON TABLE public.user_hiragana_rule_progress TO service_role;


--
-- Name: SEQUENCE user_hiragana_rule_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_hiragana_rule_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_hiragana_rule_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_hiragana_rule_progress_id_seq TO service_role;


--
-- Name: TABLE user_kanji_basics_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_kanji_basics_progress TO anon;
GRANT ALL ON TABLE public.user_kanji_basics_progress TO authenticated;
GRANT ALL ON TABLE public.user_kanji_basics_progress TO service_role;


--
-- Name: SEQUENCE user_kanji_basics_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_kanji_basics_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_kanji_basics_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_kanji_basics_progress_id_seq TO service_role;


--
-- Name: TABLE user_kanji_meaning_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_kanji_meaning_progress TO anon;
GRANT ALL ON TABLE public.user_kanji_meaning_progress TO authenticated;
GRANT ALL ON TABLE public.user_kanji_meaning_progress TO service_role;


--
-- Name: SEQUENCE user_kanji_meaning_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_kanji_meaning_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_kanji_meaning_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_kanji_meaning_progress_id_seq TO service_role;


--
-- Name: TABLE user_kanji_reading_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_kanji_reading_progress TO anon;
GRANT ALL ON TABLE public.user_kanji_reading_progress TO authenticated;
GRANT ALL ON TABLE public.user_kanji_reading_progress TO service_role;


--
-- Name: SEQUENCE user_kanji_reading_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_kanji_reading_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_kanji_reading_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_kanji_reading_progress_id_seq TO service_role;


--
-- Name: TABLE user_katakana_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_katakana_progress TO anon;
GRANT ALL ON TABLE public.user_katakana_progress TO authenticated;
GRANT ALL ON TABLE public.user_katakana_progress TO service_role;


--
-- Name: SEQUENCE user_katakana_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_katakana_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_katakana_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_katakana_progress_id_seq TO service_role;


--
-- Name: TABLE user_katakana_rule_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_katakana_rule_progress TO anon;
GRANT ALL ON TABLE public.user_katakana_rule_progress TO authenticated;
GRANT ALL ON TABLE public.user_katakana_rule_progress TO service_role;


--
-- Name: SEQUENCE user_katakana_rule_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_katakana_rule_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_katakana_rule_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_katakana_rule_progress_id_seq TO service_role;


--
-- Name: TABLE user_reading_test_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_reading_test_attempts TO anon;
GRANT ALL ON TABLE public.user_reading_test_attempts TO authenticated;
GRANT ALL ON TABLE public.user_reading_test_attempts TO service_role;


--
-- Name: TABLE user_reading_test_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_reading_test_progress TO anon;
GRANT ALL ON TABLE public.user_reading_test_progress TO authenticated;
GRANT ALL ON TABLE public.user_reading_test_progress TO service_role;


--
-- Name: SEQUENCE user_reading_test_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_reading_test_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_reading_test_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_reading_test_progress_id_seq TO service_role;


--
-- Name: TABLE user_study_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_study_settings TO anon;
GRANT ALL ON TABLE public.user_study_settings TO authenticated;
GRANT ALL ON TABLE public.user_study_settings TO service_role;


--
-- Name: TABLE user_vocabulary_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_vocabulary_progress TO anon;
GRANT ALL ON TABLE public.user_vocabulary_progress TO authenticated;
GRANT ALL ON TABLE public.user_vocabulary_progress TO service_role;


--
-- Name: SEQUENCE user_vocabulary_progress_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_vocabulary_progress_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_vocabulary_progress_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_vocabulary_progress_id_seq TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: COLUMN users.display_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(display_name) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.avatar_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(avatar_url) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.country; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(country) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.show_country_on_leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(show_country_on_leaderboard) ON TABLE public.users TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--




-- 1. Triggers on auth.users (profile creation on sign-up, email/metadata sync, Gmail-only rule)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_change();
CREATE TRIGGER on_auth_user_metadata_changed AFTER UPDATE OF raw_user_meta_data ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_user_metadata_change();
CREATE TRIGGER on_auth_user_require_gmail BEFORE INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enforce_gmail_email();

-- 2. Storage bucket (a ROW, not schema) + its policies
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

CREATE POLICY "Public can read avatars" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- Schema-level privileges on public (pg_restore -n omits them; found by diffing against a fresh dump of the live schema)
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- back to the session default
RESET search_path;

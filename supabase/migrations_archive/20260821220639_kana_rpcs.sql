-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Kana learning track, phase 2: introduce_hiragana/introduce_katakana (modeled on
-- introduce_kanji/introduce_vocabulary -- daily cap via advisory lock + day-boundary
-- count), get_new_hiragana_candidates/get_new_katakana_candidates (modeled on
-- get_new_kanji_candidates, but ordered by sort_order instead of id -- gojuon
-- textbook order, not insertion order), and get_due_cards/submit_review/get_next_due
-- extended with hiragana_reading/katakana_reading branches.
--
-- get_due_cards reads study_track itself (inline subquery against
-- user_study_settings) rather than trusting the client-sent p_include_* flags --
-- even a malformed/forged call can never surface both tracks' cards at once, only
-- whichever track the row actually says the user is on right now.

create or replace function public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

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

  if v_count >= v_cap then
    raise exception 'Daily new hiragana limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

create or replace function public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

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

  if v_count >= v_cap then
    raise exception 'Daily new katakana limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

-- "character" is a reserved SQL keyword (CHAR type synonym) -- fine as a plain column
-- reference in DML, but must be double-quoted wherever it appears in a function's
-- parameter/output-column list (RETURNS TABLE) or it fails to parse.
create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  select h.id, h."character", h.romaji, h.gojuon_row
  from public.hiragana h
  where not exists (
    select 1 from public.user_hiragana_progress p
    where p.user_id = p_user_id and p.hiragana_id = h.id
  )
  order by h.sort_order asc
  limit p_limit;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  select k.id, k."character", k.romaji, k.gojuon_row
  from public.katakana k
  where not exists (
    select 1 from public.user_katakana_progress p
    where p.user_id = p_user_id and p.katakana_id = k.id
  )
  order by k.sort_order asc
  limit p_limit;
$function$;

drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, integer);

create function public.get_due_cards(
  p_user_id uuid,
  p_enabled_levels text[],
  p_include_kanji boolean,
  p_include_vocab boolean,
  p_include_hiragana boolean,
  p_include_katakana boolean,
  p_limit integer
)
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
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
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p_include_kanji
      and (select s.study_track from public.user_study_settings s where s.user_id = p_user_id) = 'standard'
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
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
          and exists (
            select 1
            from public.kanji_word kw3
            join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
            where kw3.id_kanji = kw2.id_kanji
              and kw3.reading_group = kw2.reading_group
              and p3.user_id = p_user_id
              and p3.status = 'review'
              and p3.repetitions >= 2
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p_include_kanji
      and (select s.study_track from public.user_study_settings s where s.user_id = p_user_id) = 'standard'
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

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
      v.meanings as word_meanings,
      (
        select array_agg(distinct m)
        from (
          select unnest(v2.meanings) as m
          from public.vocabulary v2
          where v2.word = v.word
            and v2.kana_reading is not distinct from v.kana_reading
        ) meanings
      ) as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p_include_vocab
      and (select s.study_track from public.user_study_settings s where s.user_id = p_user_id) = 'standard'
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and v.jlpt_level = any(p_enabled_levels)

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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    where p_include_hiragana
      and (select s.study_track from public.user_study_settings s where s.user_id = p_user_id) = 'kana'
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'

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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    where p_include_katakana
      and (select s.study_track from public.user_study_settings s where s.user_id = p_user_id) = 'kana'
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
  ) due
  order by due_at asc
  limit p_limit;
$function$;

create or replace function public.get_next_due(p_user_id uuid, p_timezone text default 'UTC')
returns table(next_due_at timestamptz, next_due_is_today boolean)
language plpgsql
stable
as $function$
declare
  v_next_due_at timestamptz;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_end timestamptz := ((v_local_date::text)::timestamp at time zone p_timezone) + interval '1 day';
begin
  select min(due_at) into v_next_due_at
  from (
    select due_at from public.user_kanji_meaning_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_kanji_reading_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_vocabulary_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_hiragana_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_katakana_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
  ) t;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end);
end;
$function$;

-- submit_review's parameter list is gaining two new typed positions (p_hiragana_id,
-- p_katakana_id) -- CREATE OR REPLACE cannot change a function's parameter type
-- signature (it would instead create a second, ambiguous overload alongside the old
-- one), so the old 8-arg signature has to be dropped explicitly first.
drop function if exists public.submit_review(uuid, text, smallint, bigint, bigint, bigint, text, bigint);

create function public.submit_review(
  p_user_id uuid,
  p_exercise_type text,
  p_rating smallint,
  p_kanji_id bigint default null,
  p_word_id bigint default null,
  p_kanji_word_id bigint default null,
  p_hiragana_id bigint default null,
  p_katakana_id bigint default null,
  p_user_answer text default null,
  p_session_id bigint default null
)
returns bigint
language plpgsql
as $function$
declare
  v_current record;
  v_result record;
  v_kanji_id_for_log bigint;
  v_word_id_for_log bigint;
  v_hiragana_id_for_log bigint;
  v_katakana_id_for_log bigint;
  v_log_id bigint;
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

  return v_log_id;
end;
$function$;

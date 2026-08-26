-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Replaces 20260829_pair_new_vocab_with_vocab_batch.sql's timing-based approach (hide a
-- newly-introduced word behind a longer due_at, hoping the user finishes today's whole batch
-- before it naturally elapses) with a state-based one: a word is only ever hidden from the
-- normal due-card query while it's explicitly marked pending_batch, with no delay of any length
-- involved -- a user who leaves the app open and walks away for hours can never cause an
-- early leak, because nothing about visibility depends on the clock.
--
-- Four changes:
--
-- 1. New column user_vocabulary_progress.pending_batch (bool, default false). A row is
--    pending_batch = true from the moment introduce_vocabulary creates it until
--    complete_vocab_batch (below) explicitly clears it -- there is no other way for it to
--    become false, and no timer involved.
--
-- 2. introduce_vocabulary inserts with pending_batch = true and reverts due_at to the normal
--    now() + interval '1 minute' first learning step (the same one every other exercise type
--    uses) -- due_at no longer does any hiding work, since get_due_cards (change 3) excludes
--    pending_batch rows outright regardless of due_at. The old "flip due_at for all of today's
--    rows once the daily cap is reached" logic is removed -- completion is now driven entirely
--    by complete_vocab_batch, called explicitly by the client.
--
-- 3. get_due_cards' vocab_meaning branch adds "and not p.pending_batch" -- a pending row is
--    invisible to every normal poll no matter how much real time passes. Same for
--    get_today_activity_counts' due_today/due_learning vocabulary subqueries, so the
--    dashboard's "cards to do today" count doesn't include words the user can't actually see
--    yet.
--
-- 4. New complete_vocab_batch RPC: atomically flips pending_batch = false (and due_at = now(),
--    so it's consistent with a freshly-due row for anything else that inspects due_at) for
--    every row still pending for that user, and returns exactly the rows it just flipped (via
--    an UPDATE ... RETURNING CTE, so a concurrent caller -- another tab, or this same user's own
--    next poll -- can never double-return the same row: whichever transaction's UPDATE commits
--    first captures them, the other gets zero rows back). The client calls this in two places:
--    right when it detects the last "New vocabulary" card in the queue was just introduced (the
--    normal, same-session path), and opportunistically whenever a queue fetch finds there are no
--    more New vocabulary candidates left to introduce at all -- so a batch a user left half
--    finished (closed the tab, wandered off, whatever) gets flushed the moment they next open
--    /study, no matter how long that took. Supersedes get_vocab_intro_cards, which is dropped.

alter table public.user_vocabulary_progress
  add column if not exists pending_batch boolean not null default false;

create or replace function public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
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
  perform pg_advisory_xact_lock(hashtext('introduce_vocabulary:' || p_user_id::text));

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
$function$;

create or replace function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 language sql
 stable
as $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
  )
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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pending_batch
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
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
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
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
  ) due
  order by due_at asc
  limit p_limit;
$function$;

create or replace function public.get_today_activity_counts(p_user_id uuid, p_timezone text default 'UTC'::text)
 returns table(due_today integer, due_learning integer, reviewed_today integer, new_kanji_today integer, new_vocab_today integer, new_hiragana_today integer, new_katakana_today integer)
 language plpgsql
 stable
as $function$
declare
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_study_track text;
begin
  select study_track into v_study_track from public.user_study_settings where user_id = p_user_id;

  return query
  select
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pending_batch)
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended')
      else 0 end
    )::integer,
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pending_batch)
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning'))
      else 0 end
    )::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;

create or replace function public.complete_vocab_batch(p_user_id uuid)
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
as $function$
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
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$function$;

drop function if exists public.get_vocab_intro_cards(uuid, text);

grant execute on function public.complete_vocab_batch(uuid) to authenticated;

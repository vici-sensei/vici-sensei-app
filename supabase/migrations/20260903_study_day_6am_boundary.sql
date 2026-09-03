-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a mismatch surfaced on the dashboard: get_review_activity (the 7-day flame strip)
-- buckets activity by the user's LOCAL calendar day, while get_review_streak (the streak
-- number) bucketed by the server's UTC calendar day (unchanged since 20260819_review_streak_
-- set_based.sql, which deliberately left it on UTC "to avoid changing the existing streak
-- number" -- see that file's header). Near the UTC/local midnight seam this let the flame
-- strip show two lit days while the streak number still reported 1, because the same
-- timestamps landed in two different LOCAL days but one still-ongoing UTC day.
--
-- Fix has two parts:
--
-- 1. Every "what day is this activity on" computation in the schema moves to a single shared
--    pair of helpers (study_day / study_day_bounds) instead of each function inlining its own
--    v_local_date/v_day_start/v_day_end -- that duplication is exactly how get_review_streak
--    and get_review_activity drifted apart in the first place.
--
-- 2. The day boundary itself moves from local midnight to local 6AM (study_day's
--    p_offset_hours, default 6): a study session that runs past midnight (e.g. 23:40-00:20)
--    now stays inside a single "study day" instead of splitting into two, which also closes a
--    minor new-card-cap loophole (grinding two calendar days' worth of new kanji/vocab/kana in
--    one sitting by studying across a midnight boundary).
--
-- Touches (all still take p_timezone from the browser's IANA zone, same as before):
--   get_review_streak, get_streak_active_days, get_review_streak_record  (signature gains
--     p_timezone -- previously UTC-only, now consistent with everything else)
--   get_review_activity, get_today_activity_counts, get_next_due,
--   introduce_kanji, introduce_vocabulary, introduce_hiragana, introduce_katakana,
--   introduce_hiragana_examples, introduce_katakana_examples  (signature unchanged, body now
--     calls study_day_bounds instead of inlining it)
--
-- Deliberately NOT touched: get_leaderboard_streak and the leaderboard_stats_on_review_insert/
-- _undo triggers. Those compute streaks across ALL users at once (or from a DB trigger with no
-- request context) and there is nowhere to get a per-user timezone from -- the schema doesn't
-- persist one anywhere (confirmed: no timezone/time_zone column exists in public.*). Making the
-- leaderboard timezone-aware would need a stored per-user timezone first; that's a separate
-- feature, not a bugfix. The leaderboard's current_streak stays on UTC-midnight boundaries,
-- same as it already was -- no regression, just not upgraded.

-- 1. Shared day-bucketing helpers -----------------------------------------------------------

create or replace function public.study_day(p_at timestamptz, p_timezone text, p_offset_hours integer default 6)
returns date
language sql
stable
as $$
  select ((p_at at time zone p_timezone) - make_interval(hours => p_offset_hours))::date
$$;

create or replace function public.study_day_bounds(
  p_timezone text,
  p_offset_hours integer default 6,
  p_at timestamptz default now()
)
returns table (day_start timestamptz, day_end timestamptz)
language sql
stable
as $$
  select
    (public.study_day(p_at, p_timezone, p_offset_hours)::timestamp + make_interval(hours => p_offset_hours))
      at time zone p_timezone,
    (public.study_day(p_at, p_timezone, p_offset_hours)::timestamp + make_interval(hours => p_offset_hours))
      at time zone p_timezone + interval '1 day'
$$;

-- 2. get_review_streak / get_streak_active_days / get_review_streak_record become
--    timezone-aware -- signature gains p_timezone, so old positional single-arg calls still
--    work (default 'UTC'), but every client call site is updated in this same change to pass
--    the real browser timezone. -------------------------------------------------------------

drop function if exists public.get_review_streak(uuid);
drop function if exists public.get_review_streak_record(uuid);
drop function if exists public.get_streak_active_days(uuid);

create function public.get_streak_active_days(p_user_id uuid, p_timezone text default 'UTC')
returns table (d date)
language sql
stable
as $$
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
  ) a;
$$;

grant execute on function public.get_streak_active_days(uuid, text) to authenticated;

create function public.get_review_streak(p_user_id uuid, p_timezone text default 'UTC')
returns integer
language sql
stable
as $$
  with active_days as (
    select d from public.get_streak_active_days(p_user_id, p_timezone)
    where d <= public.study_day(now(), p_timezone)
  ),
  grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from active_days
  ),
  runs as (
    select max(d) as run_end, count(*) as run_len
    from grp
    group by grp
  )
  select coalesce((select run_len from runs where run_end = public.study_day(now(), p_timezone)), 0);
$$;

grant execute on function public.get_review_streak(uuid, text) to authenticated;

create function public.get_review_streak_record(p_user_id uuid, p_timezone text default 'UTC')
returns integer
language sql
stable
as $$
  with grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from public.get_streak_active_days(p_user_id, p_timezone)
  )
  select coalesce(max(run_len), 0)
  from (
    select count(*) as run_len from grp group by grp
  ) runs;
$$;

grant execute on function public.get_review_streak_record(uuid, text) to authenticated;

-- 3. get_review_activity -- same signature, body now uses the shared 6AM bucketing ----------

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean
)
language sql
stable
as $$
  with days as (
    select generate_series(
      public.study_day(now(), p_timezone) - (p_days - 1),
      public.study_day(now(), p_timezone),
      interval '1 day'
    )::date as day
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
  )
  select
    d.day,
    exists (
      select 1 from activity_at a
      where public.study_day(a.at, p_timezone) = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

grant execute on function public.get_review_activity(uuid, text, integer) to authenticated;

-- 4. get_today_activity_counts -- same signature, body now calls study_day_bounds -----------

create or replace function public.get_today_activity_counts(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table(
  due_today integer,
  due_learning integer,
  reviewed_today integer,
  new_kanji_today integer,
  new_vocab_today integer,
  new_hiragana_today integer,
  new_katakana_today integer
)
language plpgsql
stable
as $function$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_study_track text;
begin
  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);
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
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending)
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
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending)
      else 0 end
    )::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;

-- 5. get_next_due -- same signature, body now calls study_day_bounds -----------------------

create or replace function public.get_next_due(p_user_id uuid, p_timezone text default 'UTC')
returns table(next_due_at timestamp with time zone, next_due_is_today boolean, next_due_status text)
language plpgsql
stable
as $function$
declare
  v_next_due_at timestamptz;
  v_next_due_status text;
  v_day_end timestamptz;
begin
  select day_end into v_day_end from public.study_day_bounds(p_timezone);

  select due_at, status into v_next_due_at, v_next_due_status
  from (
    select due_at, status from public.user_kanji_meaning_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_kanji_reading_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_vocabulary_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
  ) t
  order by due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$function$;

-- 6. introduce_kanji / introduce_vocabulary -- same signatures, bodies now call
--    study_day_bounds -------------------------------------------------------------------

create or replace function public.introduce_kanji(
  p_user_id uuid,
  p_kanji_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
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
$function$;

create or replace function public.introduce_vocabulary(
  p_user_id uuid,
  p_word_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
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
$function$;

-- 7. introduce_hiragana / introduce_katakana -- same signatures, bodies now call
--    study_day_bounds -------------------------------------------------------------------

create or replace function public.introduce_hiragana(
  p_user_id uuid,
  p_hiragana_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns table(pack_completed boolean, hiragana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_gojuon_row text;
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

  select gojuon_row into v_gojuon_row from public.hiragana where id = p_hiragana_id;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    -- Over the cap already -- still allow this one if it's finishing a pack
    -- (another character from the same gojuon_row) that was already started
    -- today, rather than starting a fresh pack once the cap is spent.
    if not exists (
      select 1
      from public.user_hiragana_progress p
      join public.hiragana h on h.id = p.hiragana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and h.gojuon_row = v_gojuon_row
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
  where gojuon_row = v_gojuon_row and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  where p.user_id = p_user_id
    and h.gojuon_row = v_gojuon_row
    and h.entry_kind = 'character'
    and h.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_hiragana_progress p
    set pack_pending = false, due_at = now()
    from public.hiragana h
    where p.hiragana_id = h.id
      and p.user_id = p_user_id
      and h.gojuon_row = v_gojuon_row
      and h.entry_kind = 'character'
      and h.study_enabled;

    select array_agg(h.id order by h.sort_order) into v_ids
    from public.hiragana h
    where h.gojuon_row = v_gojuon_row and h.entry_kind = 'character' and h.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;

create or replace function public.introduce_katakana(
  p_user_id uuid,
  p_katakana_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns table(pack_completed boolean, katakana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_gojuon_row text;
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

  select gojuon_row into v_gojuon_row from public.katakana where id = p_katakana_id;

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
        and k.gojuon_row = v_gojuon_row
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
  where gojuon_row = v_gojuon_row and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  where p.user_id = p_user_id
    and k.gojuon_row = v_gojuon_row
    and k.entry_kind = 'character'
    and k.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_katakana_progress p
    set pack_pending = false, due_at = now()
    from public.katakana k
    where p.katakana_id = k.id
      and p.user_id = p_user_id
      and k.gojuon_row = v_gojuon_row
      and k.entry_kind = 'character'
      and k.study_enabled;

    select array_agg(k.id order by k.sort_order) into v_ids
    from public.katakana k
    where k.gojuon_row = v_gojuon_row and k.entry_kind = 'character' and k.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;

-- 8. introduce_hiragana_examples / introduce_katakana_examples -- same signatures, bodies now
--    call study_day_bounds ----------------------------------------------------------------

create or replace function public.introduce_hiragana_examples(
  p_user_id uuid,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns table(hiragana_id bigint)
language plpgsql
as $function$
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

  -- Reuses get_new_hiragana_candidates itself (locked to this same real remaining budget) instead
  -- of re-deriving eligibility here -- so this can never disagree with what new_hiragana_to_introduce
  -- shows, and any future change to that selection logic (gojuon grouping, study_enabled filtering,
  -- drillable rules...) applies here automatically, with nothing to keep in sync by hand.
  return query
  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_hiragana_candidates(p_user_id, v_remaining) c
  where c.entry_kind = 'example'
  on conflict (user_id, hiragana_id) do nothing
  returning user_hiragana_progress.hiragana_id;
end;
$function$;

create or replace function public.introduce_katakana_examples(
  p_user_id uuid,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns table(katakana_id bigint)
language plpgsql
as $function$
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
  where c.entry_kind = 'example'
  on conflict (user_id, katakana_id) do nothing
  returning user_katakana_progress.katakana_id;
end;
$function$;

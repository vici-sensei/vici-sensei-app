-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes the "New hiragana per day = 455" bug: introduce_hiragana_examples/introduce_katakana_examples
-- (20260906_kana_examples_skip_intro_card.sql) inserted every id the CLIENT handed them, straight
-- from a p_limit the client itself computed (new_hiragana_per_day - counts.new_hiragana_today, with
-- no upper bound anywhere) -- unlike every other introduce_* function, they never re-checked the
-- daily cap, never locked per-user, and never re-derived "what's actually eligible right now" from
-- the database's own state. A big enough new_hiragana_per_day let one fetch batch-introduce (as
-- already-due hiragana_reading review cards, no intro step) yoon/sokuon/n_gemination examples like
-- ちゃ/きゅ/んな whose base characters hadn't even been tapped through yet.
--
-- introduce_hiragana/introduce_katakana/introduce_kanji/introduce_vocabulary already solved exactly
-- this class of bug (see 20260820_enforce_daily_new_card_cap.sql's own postmortem: a client-supplied
-- day window was used to fake an empty "today" and bypass new_kanji_per_day entirely) by never
-- trusting anything client-supplied for the cap/eligibility check -- they lock per-user, recompute
-- "today" from the database's own now() + the user's timezone *preference*, and recount from the
-- source of truth. introduce_hiragana_examples/introduce_katakana_examples get the same treatment
-- here, taken one step further: they no longer take an id list from the client AT ALL. Instead they
-- call get_new_hiragana_candidates/get_new_katakana_candidates themselves -- the exact same
-- gojuon_row-pack selection logic new_hiragana_to_introduce already relies on, so there is no second
-- copy of that logic to drift out of sync -- with a p_limit computed fresh, server-side, from the
-- real remaining daily budget. A client can pass nothing meaningful to these functions any more; the
-- database alone decides what is eligible and how much fits today.
--
-- Second layer -- the one that actually stops the reported symptom, not just the trust/race gap:
-- get_new_hiragana_candidates/get_new_katakana_candidates picked whole pack_key groups (gojuon_row
-- for entry_kind='character', kana_type for entry_kind='example') purely by cumulative row count
-- against p_limit, with no idea that a 'character' pack is harmless to merely OFFER (it only ever
-- becomes a real progress row once the user taps it) while an 'example' pack is instantly written as
-- a due, drillable review card the moment it's selected -- there is no tap step for examples to
-- gate them (20260906_kana_examples_skip_intro_card.sql). So a large enough p_limit could span past
-- dozens of still-un-tapped "New hiragana" candidates and select a yoon/sokuon/n_gemination example
-- pack in the very same fetch -- which introduce_hiragana_examples would then write immediately.
-- This held even after capping new_hiragana_per_day to the content-size ceiling below: with only 3
-- characters tapped, the ceiling itself (125) is still comfortably past all 68 remaining
-- seion/dakuten/handakuten characters, so the exact ちゃ/きゅ/んな symptom was still reproducible at
-- e.g. 125, just not at 15. The actual invariant -- an example pack must never be selected while any
-- not-yet-introduced character row still precedes it in sort_order -- is now enforced directly
-- inside get_new_hiragana_candidates/get_new_katakana_candidates themselves, independent of
-- p_limit's value. Since introduce_hiragana_examples (above) already delegates its own eligibility
-- check to this same function, both the intro-card list and the silent example write get this for
-- free, from one place, with nothing to keep in sync between them.
--
-- Third layer: new_hiragana_per_day/new_katakana_per_day only had a floor (>=15); new_kanji_per_day/
-- new_vocab_per_day had no constraint at all. A plain upper-bound CHECK can't reference another
-- table's row count, so this uses a trigger instead -- it clamps every one of the four "per day"
-- settings to (at most) how much content actually exists right now, recomputed live on every write.
-- That means the ceiling updates itself automatically whenever hiragana/katakana/kanji/vocabulary
-- rows are added or removed, with nothing to hand-tune here ever again. It runs BEFORE
-- sync_new_vocab_per_day_trigger (alphabetically "clamp" < "sync") so kanji/vocab get clamped first
-- and the existing 1:6 sync recomputes the other column from an already-safe value, keeping the
-- ratio intact either way. This layer alone was not enough (see above) -- it stays as a sane sanity
-- ceiling now that the real fix lives in the candidate-selection functions themselves.

-- ---------------------------------------------------------------------------
-- 0. get_new_hiragana_candidates / get_new_katakana_candidates: never offer (or silently write) an
--    example pack while any not-yet-introduced character row still precedes it.
-- ---------------------------------------------------------------------------

create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind,
           case when h.entry_kind = 'character' then h.gojuon_row else h.kana_type end as pack_key
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
    select pack_key, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_key
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.pack_key = c.pack_key
  order by c.sort_order asc;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind,
           case when k.entry_kind = 'character' then k.gojuon_row else k.kana_type end as pack_key
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
    select pack_key, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_key
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.pack_key = c.pack_key
  order by c.sort_order asc;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. introduce_hiragana_examples / introduce_katakana_examples: self-selecting, capped, locked.
-- ---------------------------------------------------------------------------

drop function if exists public.introduce_hiragana_examples(uuid, bigint[], bigint);

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
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

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

drop function if exists public.introduce_katakana_examples(uuid, bigint[], bigint);

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
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

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

grant execute on function public.introduce_hiragana_examples(uuid, text, bigint) to authenticated;
grant execute on function public.introduce_katakana_examples(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Self-updating upper bound on every "new X per day" setting, tied to real content counts.
--    One function computes the four ceilings; the trigger enforces them server-side and
--    get_new_card_caps exposes the same numbers read-only so the settings UI can disable each
--    stepper's "+" before the user ever hits the server-side clamp -- one source of truth for
--    both instead of the UI guessing at (or hand-maintaining a copy of) this arithmetic.
-- ---------------------------------------------------------------------------

create or replace function public.get_new_card_caps()
returns table(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
language sql
stable
as $function$
  with totals as (
    select
      (select count(*) from public.kanji) as kanji_total,
      (select count(*) from public.vocabulary) as vocab_total,
      (select count(*) from public.hiragana where entry_kind != 'rule') as hiragana_total,
      (select count(*) from public.katakana where entry_kind != 'rule') as katakana_total
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
    greatest(floor(totals.hiragana_total::numeric / 5)::integer * 5, 15) as hiragana_max,
    greatest(floor(totals.katakana_total::numeric / 5)::integer * 5, 15) as katakana_max
  from totals, kanji;
$function$;

grant execute on function public.get_new_card_caps() to authenticated;

create or replace function public.clamp_new_card_caps()
returns trigger
language plpgsql
as $function$
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
$function$;

drop trigger if exists clamp_new_card_caps_trigger on public.user_study_settings;

create trigger clamp_new_card_caps_trigger
  before insert or update on public.user_study_settings
  for each row
  execute function public.clamp_new_card_caps();

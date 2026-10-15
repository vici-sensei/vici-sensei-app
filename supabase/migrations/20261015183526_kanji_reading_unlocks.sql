-- Both live projects (EU + US), identical text. Plan + decisions: docs/READING_UNLOCK_PLAN.md.
--
-- Words far above a kanji's JLPT level no longer get a "Word reading" card when the kanji is
-- introduced. They wait in user_kanji_reading_pending until the student's level gets close enough,
-- then arrive through a "Reading unlock" card (at most new_reading_unlocks_per_day words a day).
--
-- The rule (ranks: N5 = 1 ... N1 = 5, a word with no JLPT level = 6, "above N1"):
--   * a word is LOCKABLE on a kanji when word rank - kanji rank >= 2
--     (an N5 kanji's N3/N2/N1/no-level words, an N4 kanji's N2/N1/no-level words, ...);
--   * it unlocks once the student's level (highest enabled level) reaches word rank - 1
--     (N3 word -> at N4, N1 word -> at N2, no-level word -> at N1) -- kanji_word_unlock_rank();
--   * so it is LOCKED for a student while their level is still below that rank. A student already
--     past it when the kanji is introduced (e.g. an N4 student on an N5 kanji's N3 word) gets the
--     card right away, as before.
--
-- Level progress (get_level_progress, which check_and_advance_jlpt_level reads): a lockable word
-- counts toward the level at which it unlocks, not the kanji's own level -- and only for kanji the
-- student has introduced, so a student who started at N4 is never held back by N5 kanji they
-- never saw.
--
-- Safe for the app version already deployed: no existing function changes its arguments or its
-- result columns. That version just shows locked words on the "New kanji" card like any other
-- word (no reading card follows for them) and never shows "Reading unlock" cards -- the words wait
-- until the new version is deployed.
--
-- Also moves the existing reading cards that the rule now locks into user_kanji_reading_pending
-- (22 rows, 4 students on EU on 2026-10-15; none on US) -- the user's explicit choice. Their
-- progress is deleted; a review of one of them still open in a study tab gets SR404, which the
-- app already drops silently as a stale card.

-- 1. Rank helpers --------------------------------------------------------------------------------

create or replace function public.jlpt_level_rank(p_level text) returns integer
language sql immutable parallel safe
as $function$
  select array_position(array['N5','N4','N3','N2','N1'], p_level);
$function$;

-- The student level (jlpt_level_rank) at which a kanji's word unlocks; null = never locked on
-- this kanji. A word with no JLPT level ranks 6 ("above N1"), like /admin/kanji-words' level gap.
create or replace function public.kanji_word_unlock_rank(p_kanji_level text, p_word_level text) returns integer
language sql immutable parallel safe
as $function$
  select case
    when coalesce(public.jlpt_level_rank(p_word_level), 6) - public.jlpt_level_rank(p_kanji_level) >= 2
      then coalesce(public.jlpt_level_rank(p_word_level), 6) - 1
  end;
$function$;

-- p_user_rank null (no enabled levels) = lock by the kanji rule alone.
create or replace function public.kanji_word_is_locked(p_unlock_rank integer, p_user_rank integer) returns boolean
language sql immutable parallel safe
as $function$
  select coalesce(p_unlock_rank > coalesce(p_user_rank, 0), false);
$function$;

-- The student's level: their highest enabled level (same as check_and_advance_jlpt_level).
create or replace function public.user_jlpt_rank(p_user_id uuid) returns integer
language sql stable
as $function$
  select max(public.jlpt_level_rank(l))
  from public.user_study_settings s, unnest(s.enabled_levels) as l
  where s.user_id = p_user_id;
$function$;

-- 2. Daily limit ---------------------------------------------------------------------------------

alter table public.user_study_settings
  add column if not exists new_reading_unlocks_per_day integer not null default 10;

alter table public.user_study_settings
  add constraint user_study_settings_new_reading_unlocks_per_day_check
  check (new_reading_unlocks_per_day between 1 and 50);

comment on column public.user_study_settings.new_reading_unlocks_per_day is
  'How many locked kanji words (user_kanji_reading_pending) may unlock per study day, through "Reading unlock" cards. A kanji''s words unlock together, so the last kanji of the day may go over by a few words.';

-- 3. Waiting words -------------------------------------------------------------------------------

create table if not exists public.user_kanji_reading_pending (
  user_id uuid not null references public.users(id) on delete cascade,
  kanji_id bigint not null references public.kanji(id) on delete cascade,
  kanji_word_id bigint not null references public.kanji_word(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  -- Set when the "Reading unlock" card created the word's user_kanji_reading_progress row. Kept
  -- (not deleted) so today's unlocks can be counted against new_reading_unlocks_per_day.
  unlocked_at timestamp with time zone,
  primary key (user_id, kanji_word_id)
);

comment on table public.user_kanji_reading_pending is
  'Kanji words locked for a student when the kanji was introduced (kanji_word_unlock_rank above their level): no user_kanji_reading_progress row yet. unlock_kanji_readings creates it once their level is high enough.';

create index if not exists idx_ukrpending_user_kanji on public.user_kanji_reading_pending (user_id, kanji_id);
create index if not exists idx_ukrpending_user_unlocked on public.user_kanji_reading_pending (user_id, unlocked_at);

alter table public.user_kanji_reading_pending enable row level security;

create policy "Users manage own user_kanji_reading_pending" on public.user_kanji_reading_pending
  using (((select auth.uid() as uid) = user_id) and public.account_is_active(user_id))
  with check (((select auth.uid() as uid) = user_id) and public.account_is_active(user_id));

create policy "Admins can view user_kanji_reading_pending" on public.user_kanji_reading_pending
  for select to authenticated using (public.is_admin());

grant all on table public.user_kanji_reading_pending to anon;
grant all on table public.user_kanji_reading_pending to authenticated;
grant all on table public.user_kanji_reading_pending to service_role;

-- 4. Introducing a kanji -------------------------------------------------------------------------

-- Same as before, except the locked words go to user_kanji_reading_pending instead of getting a
-- reading card. Any pending row left for this kanji (it was reset) is dropped first: the kanji
-- starts over.
create or replace function public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text default 'UTC'::text, p_session_id bigint default null::bigint)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_user_rank integer;
  v_kanji_level text;
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

  v_user_rank := public.user_jlpt_rank(p_user_id);
  select level into v_kanji_level from public.kanji where id = p_kanji_id;

  insert into public.user_kanji_meaning_progress (user_id, kanji_id, session_id, status, due_at)
  values (p_user_id, p_kanji_id, p_session_id, 'learning', now());

  insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
  select p_user_id, p_kanji_id, kw.kanji_word_id, 'learning', now()
  from public.get_kanji_detail_words(p_kanji_id) kw
  where not public.kanji_word_is_locked(public.kanji_word_unlock_rank(v_kanji_level, kw.jlpt_level), v_user_rank);

  delete from public.user_kanji_reading_pending
  where user_id = p_user_id and kanji_id = p_kanji_id;

  insert into public.user_kanji_reading_pending (user_id, kanji_id, kanji_word_id)
  select p_user_id, p_kanji_id, kw.kanji_word_id
  from public.get_kanji_detail_words(p_kanji_id) kw
  where public.kanji_word_is_locked(public.kanji_word_unlock_rank(v_kanji_level, kw.jlpt_level), v_user_rank)
  on conflict (user_id, kanji_word_id) do update
    set kanji_id = excluded.kanji_id, created_at = now(), unlocked_at = null;
end;
$function$;

-- word_count = the Word reading cards introduce_kanji will actually create (locked words left
-- out; study_enabled = false words were never created either). Feeds the day's predicted total.
create or replace function public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer)
returns table(id bigint, kanji text, meanings text[], level text, kun_readings text[], on_readings text[], word_count integer)
language sql
stable
as $function$
  with u as (select public.user_jlpt_rank(p_user_id) as r)
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings,
         (select count(*)
          from public.kanji_detail_words kdw
          join public.kanji_word kw on kw.id = kdw.kanji_word_id
          join public.vocabulary v on v.id = kw.id_word
          where kdw.kanji_id = k.id
            and v.study_enabled
            and not public.kanji_word_is_locked(public.kanji_word_unlock_rank(k.level, v.jlpt_level), u.r))::integer as word_count
  from public.kanji k
  cross join u
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
$function$;

-- 5. Which words are locked (New kanji card, dictionary) -----------------------------------------

-- The words of p_kanji_ids' lists that are locked for this student right now, with the level that
-- unlocks them. A word the student already has a reading card for is never locked.
create or replace function public.get_kanji_word_locks(p_user_id uuid, p_kanji_ids bigint[])
returns table(kanji_id bigint, kanji_word_id bigint, unlock_level text)
language sql
stable
as $function$
  with u as (select public.user_jlpt_rank(p_user_id) as r)
  select kdw.kanji_id, kdw.kanji_word_id, (array['N5','N4','N3','N2','N1'])[x.unlock_rank]
  from public.kanji_detail_words kdw
  join public.kanji k on k.id = kdw.kanji_id
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  cross join u
  cross join lateral (select public.kanji_word_unlock_rank(k.level, v.jlpt_level) as unlock_rank) x
  where kdw.kanji_id = any(p_kanji_ids)
    and v.study_enabled
    and public.kanji_word_is_locked(x.unlock_rank, u.r)
    and not exists (
      select 1 from public.user_kanji_reading_progress p
      where p.user_id = p_user_id and p.kanji_word_id = kdw.kanji_word_id
    );
$function$;

-- 6. Unlocking -----------------------------------------------------------------------------------

-- Pending words the student's level now allows, on a kanji whose meaning card exists and isn't
-- suspended (a reset or paused kanji unlocks nothing). Ignores the daily limit.
create or replace function public.unlockable_kanji_readings(p_user_id uuid)
returns table(kanji_id bigint, kanji_word_id bigint, created_at timestamp with time zone)
language sql
stable
as $function$
  with u as (select public.user_jlpt_rank(p_user_id) as r)
  select q.kanji_id, q.kanji_word_id, q.created_at
  from public.user_kanji_reading_pending q
  join public.kanji k on k.id = q.kanji_id
  join public.kanji_word kw on kw.id = q.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  join public.user_kanji_meaning_progress m on m.user_id = q.user_id and m.kanji_id = q.kanji_id
  cross join u
  where q.user_id = p_user_id
    and q.unlocked_at is null
    and v.study_enabled
    and m.status <> 'suspended'
    and not public.kanji_word_is_locked(public.kanji_word_unlock_rank(k.level, v.jlpt_level), u.r);
$function$;

-- How many words wait for a "Reading unlock" card right now (level-up popup).
create or replace function public.count_unlockable_readings(p_user_id uuid)
returns integer
language sql
stable
as $function$
  select count(*)::integer from public.unlockable_kanji_readings(p_user_id);
$function$;

-- Today's "Reading unlock" cards: one row per word, grouped by kanji (lowest kanji level first,
-- then the order the kanji were introduced). Whole kanji only: a kanji is taken while today's
-- count is still under new_reading_unlocks_per_day, so the last one may go over by a few words.
create or replace function public.get_reading_unlock_candidates(p_user_id uuid, p_timezone text default null::text)
returns table(kanji_id bigint, kanji text, kanji_meanings text[], kanji_level text, kun_readings text[], on_readings text[],
              kanji_word_id bigint, word text, kana_reading text, furiganas text[], primary_meanings text[], jlpt_level text,
              usually_kana boolean)
language plpgsql
stable
as $function$
declare
  v_limit integer;
  v_done integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  select s.new_reading_unlocks_per_day into v_limit
  from public.user_study_settings s
  where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji;
  if v_limit is null then
    return;
  end if;

  select b.day_start, b.day_end into v_day_start, v_day_end
  from public.study_day_bounds(public.resolve_user_timezone(p_user_id, p_timezone)) b;

  select count(*) into v_done
  from public.user_kanji_reading_pending q
  where q.user_id = p_user_id and q.unlocked_at >= v_day_start and q.unlocked_at < v_day_end;

  if v_done >= v_limit then
    return;
  end if;

  return query
  with eligible as (
    select e.kanji_id, e.kanji_word_id, e.created_at from public.unlockable_kanji_readings(p_user_id) e
  ),
  groups as (
    select e.kanji_id, count(*) as n, min(e.created_at) as first_created, public.jlpt_level_rank(min(k.level)) as kanji_rank
    from eligible e
    join public.kanji k on k.id = e.kanji_id
    group by e.kanji_id
  ),
  ordered as (
    select g.kanji_id,
           coalesce(sum(g.n) over (order by g.kanji_rank, g.first_created, g.kanji_id
                                   rows between unbounded preceding and 1 preceding), 0) as words_before,
           row_number() over (order by g.kanji_rank, g.first_created, g.kanji_id) as group_order
    from groups g
  )
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings,
         e.kanji_word_id, v.word, v.kana_reading, v.furiganas, public.vocabulary_primary_meanings(v), v.jlpt_level,
         v.usually_kana
  from eligible e
  join ordered o on o.kanji_id = e.kanji_id
  join public.kanji k on k.id = e.kanji_id
  join public.kanji_word kw on kw.id = e.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  left join public.kanji_detail_words kdw on kdw.kanji_id = e.kanji_id and kdw.kanji_word_id = e.kanji_word_id
  where v_done + o.words_before < v_limit
  order by o.group_order, kdw.rank nulls last, e.kanji_word_id;
end;
$function$;

-- The "Reading unlock" card's Next: creates the reading cards (learning, due now) for every
-- unlockable word of this kanji, and returns every word of this kanji unlocked today -- including
-- ones another tab already unlocked, so the caller can still hand their cards to the queue.
-- P0002 (the app's "nothing to do here, drop the card") when kanji study is off, the daily limit is
-- already used up, or there is nothing to unlock.
create or replace function public.unlock_kanji_readings(p_user_id uuid, p_kanji_id bigint, p_timezone text default null::text)
returns table(kanji_word_id bigint)
language plpgsql
as $function$
declare
  v_limit integer;
  v_done integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_ids bigint[];
begin
  perform pg_advisory_xact_lock(hashtext('unlock_kanji_readings:' || p_user_id::text));

  select s.new_reading_unlocks_per_day into v_limit
  from public.user_study_settings s
  where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji;
  if v_limit is null then
    raise exception 'Kanji study is not enabled for this user' using errcode = 'P0002';
  end if;

  select b.day_start, b.day_end into v_day_start, v_day_end
  from public.study_day_bounds(public.resolve_user_timezone(p_user_id, p_timezone)) b;

  select array_agg(e.kanji_word_id) into v_ids
  from public.unlockable_kanji_readings(p_user_id) e
  where e.kanji_id = p_kanji_id;

  if v_ids is not null then
    select count(*) into v_done
    from public.user_kanji_reading_pending q
    where q.user_id = p_user_id and q.unlocked_at >= v_day_start and q.unlocked_at < v_day_end;

    if v_done >= v_limit then
      raise exception 'Daily reading unlock limit reached' using errcode = 'P0002';
    end if;

    insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
    select p_user_id, p_kanji_id, id, 'learning', now()
    from unnest(v_ids) as id
    -- by constraint name: a bare (user_id, kanji_word_id) clashes with the kanji_word_id result column
    on conflict on constraint user_kanji_reading_progress_user_id_kanji_word_id_key do nothing;

    update public.user_kanji_reading_pending q
    set unlocked_at = now()
    where q.user_id = p_user_id and q.kanji_word_id = any(v_ids);
  end if;

  return query
  select q.kanji_word_id
  from public.user_kanji_reading_pending q
  where q.user_id = p_user_id
    and q.kanji_id = p_kanji_id
    and q.unlocked_at >= v_day_start and q.unlocked_at < v_day_end;

  if not found then
    raise exception 'Nothing to unlock for this kanji' using errcode = 'P0002';
  end if;
end;
$function$;

-- 7. Level progress ------------------------------------------------------------------------------

-- Only the kanji_reading row changes: a lockable word belongs to the level it unlocks at
-- (coalesce(kanji_word_unlock_rank, kanji rank)). Its total counts the words the student actually
-- has (a card or a pending row) on kanji they introduced, so a word added to a kanji's list after
-- the student introduced it can't hold them back.
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
       join public.kanji_word kw on kw.id = p.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where p.user_id = p_user_id
         and coalesce(public.kanji_word_unlock_rank(k.level, v.jlpt_level), public.jlpt_level_rank(k.level))
             = public.jlpt_level_rank(p_level)) as seen,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       join public.kanji_word kw on kw.id = p.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where p.user_id = p_user_id
         and coalesce(public.kanji_word_unlock_rank(k.level, v.jlpt_level), public.jlpt_level_rank(k.level))
             = public.jlpt_level_rank(p_level)
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji_detail_words kdw
       join public.kanji k on k.id = kdw.kanji_id
       join public.kanji_word kw on kw.id = kdw.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where k.level = p_level and v.study_enabled
         and public.kanji_word_unlock_rank(k.level, v.jlpt_level) is null)
    +
    (select count(distinct w.kanji_word_id) from (
       select p.kanji_id, p.kanji_word_id from public.user_kanji_reading_progress p where p.user_id = p_user_id
       union
       select q.kanji_id, q.kanji_word_id from public.user_kanji_reading_pending q where q.user_id = p_user_id
     ) w
       join public.kanji k on k.id = w.kanji_id
       join public.kanji_word kw on kw.id = w.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where v.study_enabled
         and public.kanji_word_unlock_rank(k.level, v.jlpt_level) = public.jlpt_level_rank(p_level)
         and exists (
           select 1 from public.user_kanji_meaning_progress m
           where m.user_id = p_user_id and m.kanji_id = w.kanji_id
         )) as total

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
$function$;

-- 8. Grants (same as every baseline function) ----------------------------------------------------

grant all on function public.jlpt_level_rank(text) to anon, authenticated, service_role;
grant all on function public.kanji_word_unlock_rank(text, text) to anon, authenticated, service_role;
grant all on function public.kanji_word_is_locked(integer, integer) to anon, authenticated, service_role;
grant all on function public.user_jlpt_rank(uuid) to anon, authenticated, service_role;
grant all on function public.get_kanji_word_locks(uuid, bigint[]) to anon, authenticated, service_role;
grant all on function public.unlockable_kanji_readings(uuid) to anon, authenticated, service_role;
grant all on function public.count_unlockable_readings(uuid) to anon, authenticated, service_role;
grant all on function public.get_reading_unlock_candidates(uuid, text) to anon, authenticated, service_role;
grant all on function public.unlock_kanji_readings(uuid, bigint, text) to anon, authenticated, service_role;

-- 9. Existing reading cards the rule now locks -> pending ----------------------------------------

with locked as (
  select p.id, p.user_id, p.kanji_id, p.kanji_word_id
  from public.user_kanji_reading_progress p
  join public.kanji k on k.id = p.kanji_id
  join public.kanji_word kw on kw.id = p.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where public.kanji_word_is_locked(public.kanji_word_unlock_rank(k.level, v.jlpt_level), public.user_jlpt_rank(p.user_id))
),
moved as (
  insert into public.user_kanji_reading_pending (user_id, kanji_id, kanji_word_id)
  select l.user_id, l.kanji_id, l.kanji_word_id from locked l
  on conflict (user_id, kanji_word_id) do nothing
)
delete from public.user_kanji_reading_progress p
using locked l
where p.id = l.id;

notify pgrst, 'reload schema';

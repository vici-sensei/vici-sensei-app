-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Bug: a student could see "new rule" cards for two DIFFERENT kana_types back-to-back (e.g.
-- yoon_rule, then immediately sokuon_rule) with none of the first kana_type's own
-- hiragana_reading/katakana_reading cards in between, even though those cards' study_enabled
-- rows exist and should always come right after their own rule. Root cause, confirmed against
-- live data for one account: yoon_rule was answered at 12:15:35, but the 6 yoon example rows
-- only landed in user_hiragana_progress at 12:26:38 -- 11 minutes later -- while sokuon_rule was
-- already sitting in the client's local queue immediately behind yoon_rule from the very first
-- fetchStudyQueue call of the session (0 sokuon rows existed yet, so it hadn't been answered
-- either -- it was just already queued and displayed).
--
-- Two compounding causes, both fixed here:
--
-- 1) get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates (last touched by
--    20260923_kana_rule_waits_for_own_pack.sql) treat "fits in today's remaining
--    new_hiragana_per_day/new_katakana_per_day budget" (the about_to_introduce CTE) as
--    equivalent to "about to be introduced" when deciding whether material PRECEDING a rule is
--    done. That equivalence holds for entry_kind='character' rows (tapping the intro card
--    introduces them on the spot), but not for entry_kind='example' rows (sokuon/yoon/
--    n_gemination/choonpu/extended): those are never introduced by a direct tap -- they only
--    ever get inserted once their OWN rule has actually been seen (the
--    user_hiragana_rule_progress/user_katakana_rule_progress gate added in
--    20261023_gate_kana_examples_on_rule_seen.sql). So "yoon's 6 examples would fit in the 15/day
--    budget" was wrongly treated as "yoon is done", letting sokuon_rule's own "nothing
--    unfinished precedes me" check pass before yoon_rule had even been shown, let alone
--    answered. Fix: a preceding entry_kind='example' row can no longer use the
--    about_to_introduce escape hatch -- it must actually exist in user_hiragana_progress/
--    user_katakana_progress. entry_kind='character' rows are unaffected (multi-day packs like
--    dakuten's ga/za/da/ba still rely on the budget lookahead exactly as before).
--
-- 2) introduce_hiragana_rule/introduce_katakana_rule only ever marked the rule seen and returned
--    void -- the follow-up introduce_hiragana_examples/introduce_katakana_examples call that
--    actually creates the reading cards only ever ran from fetchStudyQueue, i.e. on the next poll
--    (REFRESH_INTERVAL_MS, 45s) or page load, not right when the rule was answered. Fix:
--    introduce_hiragana_rule/introduce_katakana_rule now atomically introduce their own
--    kana_type's example pack too (same daily-cap accounting as introduce_hiragana_examples,
--    just scoped to this one kana_type) and return the ids, mirroring the pack-completion
--    hand-off introduce_hiragana/introduce_katakana already use for character packs
--    (20260910_persist_kana_pack_completion.sql) -- the client can now splice the reading cards
--    in immediately, contiguous with the rule, in the same round trip. introduce_hiragana_examples/
--    introduce_katakana_examples are untouched and still serve as the catch-up path for whatever
--    a tight daily cap couldn't fit atomically.
--
-- Together: a later kana_type's rule (sokuon_rule) can no longer be offered until the earlier
-- kana_type's (yoon) pack has actually landed in user_hiragana_progress, and that landing now
-- happens in the same request as answering yoon_rule instead of on a later poll -- so the two
-- rules can never again show back-to-back with an empty gap where yoon's own reading cards
-- should have been.

create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
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
$function$;

create or replace function public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
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
$function$;

grant execute on function public.get_new_hiragana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_rule_candidates(uuid, integer) to authenticated;

-- introduce_hiragana_rule/introduce_katakana_rule change return type (void -> table(*_ids
-- bigint[])), which CREATE OR REPLACE can't do in place.
drop function if exists public.introduce_hiragana_rule(uuid, bigint, text, bigint);
drop function if exists public.introduce_katakana_rule(uuid, bigint, text, bigint);

create function public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(hiragana_ids bigint[])
language plpgsql
as $function$
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
$function$;

create function public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(katakana_ids bigint[])
language plpgsql
as $function$
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
$function$;

grant execute on function public.introduce_hiragana_rule(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana_rule(uuid, bigint, text, bigint) to authenticated;

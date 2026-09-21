-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- New "new_rule" card type: entry_kind = 'rule' rows in public.hiragana/public.katakana (the
-- dakuten/handakuten/sokuon/yoon/n_gemination/choonpu/extended explanatory rows -- see
-- 20260903_kana_orthography_rules.sql/20260903_kana_orthography_rules_expansion.sql/
-- 20260903_kana_dakuten_handakuten_rules.sql) stop flowing through the normal character pipeline
-- (new_hiragana/hiragana_reading, new_katakana/katakana_reading) and instead produce a one-time,
-- read-only intro card: shown once, "Next" marks it permanently learned, never graded, never
-- resurfaces. Per user request, they still appear in their exact sort_order position -- right
-- before the batch of characters they explain -- without consuming new_hiragana_per_day/
-- new_katakana_per_day.
--
-- Seen-state lives in two new dedicated tables (user_hiragana_rule_progress/
-- user_katakana_rule_progress) rather than user_hiragana_progress/user_katakana_progress, so a
-- rule row can never be picked up by get_due_cards, get_hiragana_reading_cards, or any SRS
-- machinery -- existence of a row is the whole state, there is no status/ease_factor/due_at to
-- track for a card that's graded once by just being read.
--
-- get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates recompute the same
-- gojuon-row-pack cumulative logic get_new_*_candidates already uses (rather than taking its
-- output as a parameter) so both can be called independently/in parallel with the same p_limit --
-- a rule row is only offered once every character that precedes it in sort_order is either
-- already introduced or part of *this same* character fetch's about-to-be-introduced set. This is
-- what keeps a rule's position exact: it can show even on a day the character cap is fully spent
-- (p_limit = 0 is handled correctly -- "about to introduce" is simply empty then), but never
-- before the material it explains.
--
-- Every place that treated "count(*) from public.hiragana/public.katakana" as the total a student
-- must master (the katakana auto-activation/regression triggers, the kana -> standard track
-- switch, the manual-toggle guard, and the level-progress stats) is updated to exclude
-- entry_kind = 'rule' -- otherwise those 100% checks could never be satisfied again, since rule
-- rows no longer ever gain a user_hiragana_progress/user_katakana_progress row.

-- ---------------------------------------------------------------------------
-- 1. Seen-state tables.
-- ---------------------------------------------------------------------------
create table public.user_hiragana_rule_progress (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  hiragana_id int8 not null references public.hiragana(id) on delete cascade,
  session_id int8 null references public.study_sessions(id) on delete set null,
  seen_at timestamptz not null default now(),
  constraint user_hiragana_rule_progress_user_id_hiragana_id_key unique (user_id, hiragana_id)
);
create index idx_uhrp_user on public.user_hiragana_rule_progress using btree (user_id);
alter table public.user_hiragana_rule_progress enable row level security;

create policy "Users manage own user_hiragana_rule_progress" on public.user_hiragana_rule_progress
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

create table public.user_katakana_rule_progress (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  katakana_id int8 not null references public.katakana(id) on delete cascade,
  session_id int8 null references public.study_sessions(id) on delete set null,
  seen_at timestamptz not null default now(),
  constraint user_katakana_rule_progress_user_id_katakana_id_key unique (user_id, katakana_id)
);
create index idx_ukrp_user on public.user_katakana_rule_progress using btree (user_id);
alter table public.user_katakana_rule_progress enable row level security;

create policy "Users manage own user_katakana_rule_progress" on public.user_katakana_rule_progress
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

-- ---------------------------------------------------------------------------
-- 2. get_new_hiragana_candidates/get_new_katakana_candidates: exclude entry_kind = 'rule' (it now
--    has its own pipeline below), and additionally return sort_order so the client can merge
--    character-pack candidates with rule candidates into one correctly-ordered sequence.
-- ---------------------------------------------------------------------------
drop function if exists public.get_new_hiragana_candidates(uuid, integer);

create function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order
    from public.hiragana h
    where h.entry_kind != 'rule'
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
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

drop function if exists public.get_new_katakana_candidates(uuid, integer);

create function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order
    from public.katakana k
    where k.entry_kind != 'rule'
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
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

-- ---------------------------------------------------------------------------
-- 3. get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates: not-yet-seen rule rows,
--    gated the same way as the character candidates, but only once nothing that precedes them
--    (by sort_order) is still un-introduced and un-offered by this same p_limit. `examples`
--    bundles the rule's illustrative rows (entry_kind = 'example' for sokuon/yoon/n_gemination/
--    choonpu/extended, or the real entry_kind = 'character' rows for seion/dakuten/handakuten,
--    which have no separate 'example' rows of their own -- same split Browse's RuleSubsection/
--    GojuonRowSection already render) as one jsonb array, so the "lesson" card needs no second
--    fetch.
-- ---------------------------------------------------------------------------
create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.gojuon_row, h.sort_order
    from public.hiragana h
    where h.entry_kind != 'rule'
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji) order by e.sort_order),
        '[]'::jsonb
      )
      from public.hiragana e
      where e.kana_type = r.kana_type and e.entry_kind in ('character', 'example')
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
        and h.sort_order < r.sort_order
        and not exists (select 1 from public.user_hiragana_progress p where p.user_id = p_user_id and p.hiragana_id = h.id)
        and not exists (select 1 from about_to_introduce a where a.id = h.id)
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
    select k.id, k.gojuon_row, k.sort_order
    from public.katakana k
    where k.entry_kind != 'rule'
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji) order by e.sort_order),
        '[]'::jsonb
      )
      from public.katakana e
      where e.kana_type = r.kana_type and e.entry_kind in ('character', 'example')
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
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and not exists (select 1 from about_to_introduce a where a.id = k.id)
    )
  order by r.sort_order asc;
$function$;

-- ---------------------------------------------------------------------------
-- 4. introduce_hiragana_rule/introduce_katakana_rule: mark a rule permanently seen. No cap, no
--    SRS state -- a plain insert. p_timezone is accepted (unused) so the client's generic
--    introduceCard() helper (lib/data/introduce.ts) can call this exactly like every other
--    introduce_* RPC without a special case.
-- ---------------------------------------------------------------------------
create or replace function public.introduce_hiragana_rule(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
begin
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

  insert into public.user_hiragana_rule_progress (user_id, hiragana_id, session_id)
  values (p_user_id, p_hiragana_id, p_session_id);
end;
$function$;

create or replace function public.introduce_katakana_rule(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
begin
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

  insert into public.user_katakana_rule_progress (user_id, katakana_id, session_id)
  values (p_user_id, p_katakana_id, p_session_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Every "is every hiragana/katakana character mastered?" check excludes entry_kind = 'rule'
--    from here on -- a rule row never gains a user_hiragana_progress/user_katakana_progress row
--    any more, so leaving it in these denominators would make 100% permanently unreachable.
--    Bodies are otherwise byte-for-byte the same as their current definitions (see
--    20260823_hiragana_katakana_resume_fix.sql, 20260823_kana_standard_auto_activation.sql,
--    20260825_enforce_katakana_requires_hiragana.sql, 20260825_hiragana_regression_disables_katakana.sql,
--    20260822_kana_level_progress.sql).
-- ---------------------------------------------------------------------------
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
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule')
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
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule')
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
    ) >= (select count(*) from public.katakana where entry_kind != 'rule')
    and (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule')
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
    ) < (select count(*) from public.hiragana where entry_kind != 'rule')
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
    ) < (select count(*) from public.hiragana where entry_kind != 'rule')
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
    (select count(*) from public.hiragana where entry_kind != 'rule') as total

  union all

  select 'katakana_reading'::text,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_katakana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.katakana where entry_kind != 'rule') as total;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------
grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_hiragana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.introduce_hiragana_rule(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana_rule(uuid, bigint, text, bigint) to authenticated;

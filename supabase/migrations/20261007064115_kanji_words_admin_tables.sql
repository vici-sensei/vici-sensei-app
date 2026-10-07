-- EU-new + US-new BOTH, identical text (reference data is identical on both; the frozen project does not get it).
--
-- Admin-editable kanji example words (/admin/kanji-words, docs/KANJI_WORDS_ADMIN_PLAN.md), part 1 of 4:
-- tables, rebuild split into "algorithm" + "apply admin overrides", append-only history, daily snapshots.
-- Part 2 (..._kanji_words_admin_rpcs.sql, both) has the admin RPCs and the cross-region push; parts 3/4
-- (_eu / _us) only say which foreign schema the push writes through.
--
-- Until now rebuild_kanji_detail_words() wrote the list students see (public.kanji_detail_words) directly,
-- after a TRUNCATE, so nothing an admin chose could survive a rebuild. Now:
--
--   kanji_detail_words_algo   what the algorithm picked (exactly what rebuild used to write into
--                             kanji_detail_words) -- rewritten by every rebuild, never by an admin
--   kanji_word_algo_info      one row per candidate: why the algorithm took / skipped it (for the admin UI)
--   kanji_word_overrides      the admin layer: 'add' = word the algorithm did not pick, 'remove' = word it did
--   kanji_detail_words        UNCHANGED shape, still the only thing the app reads (get_kanji_detail_words,
--                             get_new_kanji_candidates.word_count, introduce_kanji, level progress): now
--                             rebuilt as (algo - removes + adds) by apply_kanji_word_overrides()
--   kanji_word_review         per-kanji version counter (optimistic locking) + the "reviewed" mark
--   kanji_word_history        APPEND-ONLY log: one row per change, with the COMPLETE override set after it, so
--                             restoring to any version / any moment is a plain read
--   kanji_detail_words_snapshots  APPEND-ONLY daily copy of the final list (skipped when unchanged)
--
-- The order of a kanji's words keeps the algorithm's rule (reading_group, tier, level_gap, is_common desc,
-- freq_score desc, id); the keys now live in ONE place, the view kanji_word_sort_keys, which both the
-- algorithm and the override step read. With zero overrides the final list is byte-identical to before; this
-- file proves it (DO block at the end) and aborts the whole migration otherwise.
--
-- "level_gap" keeps the algorithm's convention: a word without a JLPT level counts as rank 6 (beyond N1).
--
-- rebuild_kanji_detail_words() is also locked down: it was executable by anon/authenticated (and those roles
-- hold TRUNCATE on kanji_detail_words), nothing in the app calls it, so it is now postgres/service_role only.
--
-- If rebuild runs again, run it on BOTH regions in the same sitting (like every reference-data change here):
-- the "algorithm changed since your review" history rows it may write are generated per region.

-- ---------- Sort keys: the single source for tier / level_gap / is_common / freq_score ----------

create or replace view public.kanji_word_sort_keys as
select
  kw.id_kanji as kanji_id,
  kw.id as kanji_word_id,
  kw.reading_group,
  case when w.word_rank <= k.lvl_rank then 1 else 2 end as tier,
  greatest(w.word_rank - k.lvl_rank, 0) as level_gap,
  w.word_rank - k.lvl_rank as signed_gap,
  v.is_common_jisho as is_common,
  coalesce(v.frequency_number, 0) as freq_score
from public.kanji_word kw
join public.vocabulary v on v.id = kw.id_word
join public.kanji kk on kk.id = kw.id_kanji
cross join lateral (
  select coalesce(array_position(array['N5', 'N4', 'N3', 'N2', 'N1']::text[], kk.level), 6) as lvl_rank
) k
cross join lateral (
  select coalesce(array_position(array['N5', 'N4', 'N3', 'N2', 'N1']::text[], v.jlpt_level), 6) as word_rank
) w;

-- ---------- Tables ----------

create table public.kanji_detail_words_algo (
  kanji_id bigint not null references public.kanji(id) on delete cascade,
  kanji_word_id bigint not null references public.kanji_word(id) on delete cascade,
  rank integer not null,
  primary key (kanji_id, kanji_word_id)
);
create index idx_kanji_detail_words_algo_kanji_rank on public.kanji_detail_words_algo (kanji_id, rank);

create table public.kanji_word_algo_info (
  kanji_id bigint not null references public.kanji(id) on delete cascade,
  kanji_word_id bigint not null references public.kanji_word(id) on delete cascade,
  -- 0 = normal word, 1 = shared-furigana word, 2 = usually_kana word (see rebuild below)
  cand_class smallint not null,
  -- cand_class is the kanji's best available class (the only class the algorithm looks at for this kanji)
  in_class boolean not null,
  tier smallint not null,
  level_gap smallint not null,
  -- the next three are only set when in_class
  group_size integer,
  group_rank integer,
  group_selected boolean,
  -- 'champion' = best word of its reading group, 'fill_in' = added because < 3 groups; null = not picked
  pick_kind text check (pick_kind in ('champion', 'fill_in')),
  -- same word text as this other kanji_word row, which won the de-duplication
  dup_of bigint,
  primary key (kanji_id, kanji_word_id)
);

create table public.kanji_word_overrides (
  kanji_id bigint not null references public.kanji(id) on delete cascade,
  kanji_word_id bigint not null references public.kanji_word(id) on delete cascade,
  op text not null check (op in ('add', 'remove')),
  primary key (kanji_id, kanji_word_id)
);

create table public.kanji_word_review (
  kanji_id bigint primary key references public.kanji(id) on delete cascade,
  version integer not null default 0,
  reviewed boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid,
  -- the algorithm's word ids (sorted) at the moment of the last review; when it differs from the current
  -- algorithm output the kanji shows "algorithm changed"
  algo_ids_at_review bigint[],
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.kanji_word_history (
  id uuid primary key default gen_random_uuid(),
  -- no foreign keys on purpose: nothing a reference-data refresh does may delete or block a history row
  kanji_id bigint not null,
  version integer not null,
  kind text not null check (kind in
    ('save', 'reset', 'restore', 'bulk', 'undo_batch', 'restore_all', 'review', 'algo_changed')),
  batch_id uuid,
  -- {"add": [kanji_word_id...], "remove": [kanji_word_id...]}: the COMPLETE override set after this change
  overrides jsonb not null,
  -- the kanji's final list (in rank order) and the algorithm's list (sorted by id) at that moment
  final_ids bigint[] not null,
  algo_ids bigint[] not null,
  reviewed boolean not null,
  -- bulk operations: {"op": "remove_gap", "params": {...}}
  detail jsonb,
  note text,
  admin_id uuid,
  admin_email text,
  created_at timestamptz not null default now(),
  unique (kanji_id, version)
);
create index idx_kanji_word_history_batch on public.kanji_word_history (batch_id) where batch_id is not null;
create index idx_kanji_word_history_created on public.kanji_word_history (created_at);

create table public.kanji_detail_words_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  row_count integer not null,
  content_hash text not null,
  -- [[kanji_id, kanji_word_id, rank], ...] ordered by kanji_id, rank
  rows jsonb not null
);

-- ---------- Append-only: no UPDATE / DELETE / TRUNCATE on the log and the snapshots ----------

create or replace function public.kanji_words_block_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$function$;

create trigger kanji_word_history_append_only_row
  before update or delete on public.kanji_word_history
  for each row execute function public.kanji_words_block_mutation();
create trigger kanji_word_history_append_only_truncate
  before truncate on public.kanji_word_history
  for each statement execute function public.kanji_words_block_mutation();
create trigger kanji_detail_words_snapshots_append_only_row
  before update or delete on public.kanji_detail_words_snapshots
  for each row execute function public.kanji_words_block_mutation();
create trigger kanji_detail_words_snapshots_append_only_truncate
  before truncate on public.kanji_detail_words_snapshots
  for each statement execute function public.kanji_words_block_mutation();

-- ---------- Privileges: new public tables are granted ALL to anon/authenticated by default ----------
-- Clients never touch these directly; everything goes through the SECURITY DEFINER admin RPCs of part 2.

do $$
declare
  t text;
begin
  foreach t in array array[
    'kanji_detail_words_algo', 'kanji_word_algo_info', 'kanji_word_overrides', 'kanji_word_review',
    'kanji_word_history', 'kanji_detail_words_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end;
$$;
revoke all on public.kanji_word_sort_keys from public, anon, authenticated;
revoke update, delete, truncate on public.kanji_word_history from service_role;
revoke update, delete, truncate on public.kanji_detail_words_snapshots from service_role;
revoke all on function public.kanji_words_block_mutation() from public, anon, authenticated;

-- ---------- State of one kanji (used by the history rows and the RPCs) ----------

create or replace function public.kw_state(p_kanji_id bigint)
returns table (add_ids bigint[], remove_ids bigint[], final_ids bigint[], algo_ids bigint[])
language sql
stable
as $function$
  select
    coalesce((select array_agg(o.kanji_word_id order by o.kanji_word_id)
              from public.kanji_word_overrides o where o.kanji_id = p_kanji_id and o.op = 'add'), '{}'::bigint[]),
    coalesce((select array_agg(o.kanji_word_id order by o.kanji_word_id)
              from public.kanji_word_overrides o where o.kanji_id = p_kanji_id and o.op = 'remove'), '{}'::bigint[]),
    coalesce((select array_agg(d.kanji_word_id order by d.rank)
              from public.kanji_detail_words d where d.kanji_id = p_kanji_id), '{}'::bigint[]),
    coalesce((select array_agg(a.kanji_word_id order by a.kanji_word_id)
              from public.kanji_detail_words_algo a where a.kanji_id = p_kanji_id), '{}'::bigint[]);
$function$;

-- ---------- Final list = algorithm - removes + adds ----------
-- p_kanji_ids null = every kanji (what rebuild needs); otherwise only those kanji (what an admin save needs).
-- Overrides that no longer make sense are ignored here, never deleted: an 'add' for a word that is not (or no
-- longer) study_enabled / linked to the kanji, a 'remove' for a word the algorithm no longer picks. If two rows
-- end up with the same word text for one kanji, the algorithm's row wins (the admin RPCs refuse that case).

create or replace function public.apply_kanji_word_overrides(p_kanji_ids bigint[] default null)
returns void
language plpgsql
as $function$
begin
  if p_kanji_ids is null then
    truncate table public.kanji_detail_words;
  else
    delete from public.kanji_detail_words where kanji_id = any(p_kanji_ids);
  end if;

  insert into public.kanji_detail_words (kanji_id, kanji_word_id, rank)
  with eff as (
    select a.kanji_id, a.kanji_word_id, true as from_algo
    from public.kanji_detail_words_algo a
    where (p_kanji_ids is null or a.kanji_id = any(p_kanji_ids))
      and not exists (
        select 1 from public.kanji_word_overrides o
        where o.kanji_id = a.kanji_id and o.kanji_word_id = a.kanji_word_id and o.op = 'remove'
      )
    union all
    select o.kanji_id, o.kanji_word_id, false
    from public.kanji_word_overrides o
    where o.op = 'add' and (p_kanji_ids is null or o.kanji_id = any(p_kanji_ids))
  ),
  valid as (
    select distinct on (e.kanji_id, v.word)
      e.kanji_id, e.kanji_word_id, sk.reading_group, sk.tier, sk.level_gap, sk.is_common, sk.freq_score
    from eff e
    join public.kanji_word kw on kw.id = e.kanji_word_id and kw.id_kanji = e.kanji_id
    join public.vocabulary v on v.id = kw.id_word and v.study_enabled
    join public.kanji_word_sort_keys sk on sk.kanji_word_id = e.kanji_word_id
    order by e.kanji_id, v.word, e.from_algo desc, e.kanji_word_id
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
    )
  from valid;
end;
$function$;

-- ---------- A reviewed kanji whose algorithm list changed loses its "reviewed" mark ----------
-- Writes one 'algo_changed' history row per such kanji. Called at the end of every rebuild.

create or replace function public.kw_flag_algo_changes()
returns integer
language plpgsql
as $function$
declare
  r record;
  s record;
  v_version integer;
  v_n integer := 0;
begin
  for r in
    select rv.kanji_id, rv.algo_ids_at_review,
           coalesce((select array_agg(a.kanji_word_id order by a.kanji_word_id)
                     from public.kanji_detail_words_algo a where a.kanji_id = rv.kanji_id), '{}'::bigint[]) as algo_ids
    from public.kanji_word_review rv
    where rv.reviewed
  loop
    continue when r.algo_ids is not distinct from r.algo_ids_at_review;

    select * into s from public.kw_state(r.kanji_id);

    update public.kanji_word_review
       set version = version + 1, reviewed = false, updated_at = now(), updated_by = null
     where kanji_id = r.kanji_id
    returning version into v_version;

    insert into public.kanji_word_history
      (kanji_id, version, kind, overrides, final_ids, algo_ids, reviewed, note)
    values
      (r.kanji_id, v_version, 'algo_changed',
       jsonb_build_object('add', s.add_ids, 'remove', s.remove_ids),
       s.final_ids, s.algo_ids, false, 'Algorithm result changed since the last review');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

-- ---------- The algorithm ----------
-- Same selection as 20260923155526_kanji_detail_words_exclude_shared_furigana.sql (read its header for the
-- rules: 3 candidate classes, tiering, reading-group champions, fill-ins), with three changes:
--   * tier / level_gap / is_common / freq_score come from kanji_word_sort_keys instead of being recomputed;
--   * the result goes to kanji_detail_words_algo (+ one kanji_word_algo_info row per candidate) instead of
--     kanji_detail_words;
--   * it ends with apply_kanji_word_overrides() and kw_flag_algo_changes(), so the table students read is
--     always algorithm + admin overrides.

create or replace function public.rebuild_kanji_detail_words()
returns void
language plpgsql
as $function$
begin
  truncate table public.kanji_detail_words_algo, public.kanji_word_algo_info;

  with
  kanji_rank as (
    select k.id as kanji_id, k.kanji as kanji_char
    from public.kanji k
  ),
  scored_all as (
    select
      kw.id_kanji as kanji_id,
      kw.id as kanji_word_id,
      kw.reading_group,
      v.word,
      sk.freq_score,
      sk.is_common,
      sk.tier,
      sk.level_gap,
      case when v.usually_kana is true then 2 when sf.is_shared then 1 else 0 end as cand_class
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word and v.study_enabled
    join public.kanji_word_sort_keys sk on sk.kanji_word_id = kw.id
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select regexp_split_to_array(v.word, '') as chars
    ) c
    cross join lateral (
      select array_position(c.chars, kr.kanji_char) as pos
    ) tp
    cross join lateral (
      -- The kanji's furigana is shared with a neighbour: covered by the reading before it, or its
      -- own reading covers the next character (see the header of 20260923155526).
      select coalesce(
        array_length(v.furiganas, 1) = array_length(c.chars, 1)
        and tp.pos is not null
        and (v.furiganas[tp.pos] = '-'
             or (v.furiganas[tp.pos] <> '' and v.furiganas[tp.pos + 1] = '-')),
        false) as is_shared
    ) sf
  ),
  kanji_class as (
    select kanji_id, min(cand_class) as min_class
    from scored_all
    group by kanji_id
  ),
  scored as (
    -- Only the kanji's best available class: normal words, else its shared-furigana words, else
    -- its usually_kana words -- so every kanji with any candidate still gets example words.
    select s.kanji_id, s.kanji_word_id, s.reading_group, s.word, s.freq_score, s.is_common, s.tier, s.level_gap
    from scored_all s
    join kanji_class kc on kc.kanji_id = s.kanji_id
    where s.cand_class = kc.min_class
  ),
  deduped as (
    select distinct on (kanji_id, word)
      kanji_id, kanji_word_id, word, reading_group, tier, level_gap, is_common, freq_score
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
    -- among the kanji's 3 largest groups, or when it has >=2 words outright (only for a kanji
    -- with normal candidates, not one falling back to shared-furigana or usually_kana words)
    -- (so kanji with more than 3 genuinely big groups still keep all of them).
    select gr.kanji_id, gr.reading_group
    from group_rank gr
    join kanji_class kc on kc.kanji_id = gr.kanji_id
    where gr.size_rank <= 3
       or (gr.group_size >= 2 and kc.min_class = 0)
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
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score, 'champion'::text as pick_kind
    from group_champions
    union all
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score, 'fill_in'::text
    from fill_ins
  ),
  ins_algo as (
    insert into public.kanji_detail_words_algo (kanji_id, kanji_word_id, rank)
    select
      kanji_id,
      kanji_word_id,
      row_number() over (
        partition by kanji_id
        order by reading_group nulls last, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
      )
    from combined
    returning 1
  )
  insert into public.kanji_word_algo_info
    (kanji_id, kanji_word_id, cand_class, in_class, tier, level_gap, group_size, group_rank, group_selected, pick_kind, dup_of)
  select
    sa.kanji_id,
    sa.kanji_word_id,
    sa.cand_class,
    sa.cand_class = kc.min_class,
    sa.tier,
    sa.level_gap,
    case when sa.cand_class = kc.min_class then gs.group_size end,
    case when sa.cand_class = kc.min_class then gr.size_rank end,
    case when sa.cand_class = kc.min_class then sg.reading_group is not null end,
    c.pick_kind,
    dd.kanji_word_id
  from scored_all sa
  join kanji_class kc on kc.kanji_id = sa.kanji_id
  left join group_sizes gs on gs.kanji_id = sa.kanji_id and gs.reading_group = sa.reading_group
  left join group_rank gr on gr.kanji_id = sa.kanji_id and gr.reading_group = sa.reading_group
  left join selected_groups sg on sg.kanji_id = sa.kanji_id and sg.reading_group = sa.reading_group
  left join combined c on c.kanji_id = sa.kanji_id and c.kanji_word_id = sa.kanji_word_id
  left join deduped dd
    on dd.kanji_id = sa.kanji_id and dd.word = sa.word and dd.kanji_word_id <> sa.kanji_word_id
   and sa.cand_class = kc.min_class;

  perform public.apply_kanji_word_overrides(null);
  perform public.kw_flag_algo_changes();
end;
$function$;

revoke all on function public.rebuild_kanji_detail_words() from public, anon, authenticated;
revoke all on function public.apply_kanji_word_overrides(bigint[]) from public, anon, authenticated;
revoke all on function public.kw_flag_algo_changes() from public, anon, authenticated;
revoke all on function public.kw_state(bigint) from public, anon, authenticated;

-- ---------- Daily snapshot of the final list ----------
-- Appends a copy only when the list differs from the latest snapshot; returns its id, or null when unchanged.

create or replace function public.take_kanji_detail_words_snapshot()
returns uuid
language plpgsql
as $function$
declare
  v_rows jsonb;
  v_count integer;
  v_hash text;
  v_last text;
  v_id uuid;
begin
  select coalesce(jsonb_agg(jsonb_build_array(d.kanji_id, d.kanji_word_id, d.rank) order by d.kanji_id, d.rank, d.kanji_word_id), '[]'::jsonb),
         count(*)
    into v_rows, v_count
  from public.kanji_detail_words d;

  v_hash := md5(v_rows::text);

  select s.content_hash into v_last
  from public.kanji_detail_words_snapshots s
  order by s.taken_at desc
  limit 1;

  if v_last is not distinct from v_hash then
    return null;
  end if;

  insert into public.kanji_detail_words_snapshots (row_count, content_hash, rows)
  values (v_count, v_hash, v_rows)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.take_kanji_detail_words_snapshot() from public, anon, authenticated;

-- ---------- Self-test + first run ----------
-- With no overrides the rebuilt table must equal the one students read right now (same rows, same ranks).
-- Anything else means the refactor changed the algorithm: raise, and the whole migration rolls back.

do $$
declare
  v_before text;
  v_after text;
  v_n_before integer;
  v_n_after integer;
  v_algo integer;
  v_info integer;
  v_unpicked integer;
begin
  select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || rank, ',' order by kanji_id, kanji_word_id)), count(*)
    into v_before, v_n_before
  from public.kanji_detail_words;

  perform public.rebuild_kanji_detail_words();

  select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || rank, ',' order by kanji_id, kanji_word_id)), count(*)
    into v_after, v_n_after
  from public.kanji_detail_words;

  if v_before is distinct from v_after then
    raise exception 'rebuild_kanji_detail_words() changed the list students read: % rows / % before, % rows / % after',
      v_n_before, v_before, v_n_after, v_after;
  end if;

  select count(*) into v_algo from public.kanji_detail_words_algo;
  if v_algo <> v_n_after then
    raise exception 'algorithm table has % rows, final table has % (no overrides exist)', v_algo, v_n_after;
  end if;

  select count(*), count(*) filter (where pick_kind is null) into v_info, v_unpicked from public.kanji_word_algo_info;
  if v_info - v_unpicked <> v_algo then
    raise exception 'algo_info marks % words as picked but the algorithm picked %', v_info - v_unpicked, v_algo;
  end if;

  raise notice 'kanji words OK: % final rows (hash %), % candidates in algo_info', v_n_after, v_after, v_info;
end;
$$;

select public.take_kanji_detail_words_snapshot();

select cron.schedule('kanji-words-snapshot', '20 3 * * *', $$select public.take_kanji_detail_words_snapshot()$$);

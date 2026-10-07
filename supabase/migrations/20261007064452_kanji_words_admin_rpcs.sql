-- EU-new + US-new BOTH, identical text. Part 2 of 4 of the admin-editable kanji words (see
-- 20261007064115_kanji_words_admin_tables.sql and docs/KANJI_WORDS_ADMIN_PLAN.md): the write path, the
-- admin RPCs behind /admin/kanji-words, and the push of every change to the other region.
--
-- Everything the page does goes through SECURITY DEFINER RPCs guarded by public.is_admin(); clients have no
-- table privileges. Internal helpers (kw_*) are not executable by clients at all.
--
-- Write path (all of it in ONE transaction per RPC call):
--   kw_commit        one kanji: optimistic version check, overrides normalised against the algorithm list
--                    (an 'add' of a word the algorithm already picks, or a 'remove' of one it doesn't, is
--                    not stored), apply, version + 1, one history row holding the full state after it. A call
--                    that would change nothing writes nothing (no version bump, no history row).
--   kw_apply_items   many kanji (bulk ops, undo of a batch, restore to a moment). With p_dry_run it runs the
--                    REAL commits inside sub-transactions it then rolls back, so a preview can never disagree
--                    with what executing does.
--   kw_push          copies the touched kanji (overrides, review row, history rows, final list) to the other
--                    region through the foreign tables of part 3 / 4. Same transaction: if the other region
--                    refuses, nothing stays written here either.
--
-- Errors the page reacts to (message text): kanji_words_conflict (SQLSTATE 40001, the kanji changed since the
-- page loaded it, locally or on the other region), kanji_words_invalid_word, kanji_words_duplicate_word,
-- kanji_words_remote_missing (foreign tables of the other region not imported yet).

-- ---------- Commit one kanji ----------

create or replace function public.kw_commit(
  p_kanji_id bigint,
  p_add bigint[],
  p_remove bigint[],
  p_reviewed boolean,
  p_review_algo_ids bigint[],
  p_clear_review boolean,
  p_kind text,
  p_batch uuid,
  p_detail jsonb,
  p_note text,
  p_expected_version integer,
  p_admin_id uuid,
  p_admin_email text,
  p_strict boolean
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  r public.kanji_word_review%rowtype;
  v_algo bigint[];
  v_cur_add bigint[];
  v_cur_remove bigint[];
  v_prev_final bigint[];
  v_add bigint[];
  v_remove bigint[];
  v_reviewed boolean;
  v_review_algo bigint[];
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
  v_final bigint[];
  v_version integer;
  v_hist uuid;
begin
  if not exists (select 1 from public.kanji where id = p_kanji_id) then
    raise exception 'kanji_words_unknown_kanji' using errcode = '22023';
  end if;

  insert into public.kanji_word_review (kanji_id) values (p_kanji_id) on conflict (kanji_id) do nothing;
  select * into r from public.kanji_word_review where kanji_id = p_kanji_id for update;

  if p_expected_version is not null and r.version <> p_expected_version then
    raise exception 'kanji_words_conflict' using errcode = '40001',
      detail = format('kanji %s is at version %s, the caller expected %s', p_kanji_id, r.version, p_expected_version);
  end if;

  select s.algo_ids, s.add_ids, s.remove_ids, s.final_ids
    into v_algo, v_cur_add, v_cur_remove, v_prev_final
  from public.kw_state(p_kanji_id) s;

  v_add := array(select distinct x from unnest(coalesce(p_add, '{}'::bigint[])) x where x <> all(v_algo) order by x);
  v_remove := array(select distinct x from unnest(coalesce(p_remove, '{}'::bigint[])) x where x = any(v_algo) order by x);

  if p_strict then
    if exists (
      select 1 from unnest(v_add) x
      where not exists (
        select 1 from public.kanji_word kw join public.vocabulary v on v.id = kw.id_word
        where kw.id = x and kw.id_kanji = p_kanji_id and v.study_enabled
      )
    ) then
      raise exception 'kanji_words_invalid_word' using errcode = '22023';
    end if;
  else
    -- Restoring an old version: keep what still exists for this kanji (even if it is not study_enabled now,
    -- apply ignores it), drop what is gone.
    v_add := array(
      select x from unnest(v_add) x
      where exists (select 1 from public.kanji_word kw where kw.id = x and kw.id_kanji = p_kanji_id)
      order by x
    );
  end if;

  v_reviewed := coalesce(p_reviewed, r.reviewed);
  v_review_algo := r.algo_ids_at_review;
  v_reviewed_at := r.reviewed_at;
  v_reviewed_by := r.reviewed_by;
  if p_clear_review then
    v_review_algo := null;
    v_reviewed_at := null;
    v_reviewed_by := null;
  elsif p_reviewed is true then
    v_review_algo := coalesce(p_review_algo_ids, v_algo);
    v_reviewed_at := now();
    v_reviewed_by := p_admin_id;
  elsif p_review_algo_ids is not null then
    v_review_algo := p_review_algo_ids;
  end if;

  if v_add = v_cur_add and v_remove = v_cur_remove and v_reviewed = r.reviewed
     and v_review_algo is not distinct from r.algo_ids_at_review then
    return jsonb_build_object('kanji_id', p_kanji_id, 'changed', false, 'version', r.version);
  end if;

  delete from public.kanji_word_overrides where kanji_id = p_kanji_id;
  insert into public.kanji_word_overrides (kanji_id, kanji_word_id, op)
  select p_kanji_id, x, 'add' from unnest(v_add) x
  union all
  select p_kanji_id, x, 'remove' from unnest(v_remove) x;

  perform public.apply_kanji_word_overrides(array[p_kanji_id]);

  select s.final_ids into v_final from public.kw_state(p_kanji_id) s;

  -- An added word is missing from the final list only when another row with the same text beat it.
  if p_strict and exists (select 1 from unnest(v_add) x where x <> all(v_final)) then
    raise exception 'kanji_words_duplicate_word' using errcode = '22023';
  end if;

  update public.kanji_word_review
     set version = version + 1,
         reviewed = v_reviewed,
         reviewed_at = v_reviewed_at,
         reviewed_by = v_reviewed_by,
         algo_ids_at_review = v_review_algo,
         updated_at = now(),
         updated_by = p_admin_id
   where kanji_id = p_kanji_id
  returning version into v_version;

  insert into public.kanji_word_history
    (kanji_id, version, kind, batch_id, overrides, final_ids, algo_ids, reviewed, detail, note, admin_id, admin_email)
  values
    (p_kanji_id, v_version, p_kind, p_batch,
     jsonb_build_object('add', to_jsonb(v_add), 'remove', to_jsonb(v_remove)),
     v_final, v_algo, v_reviewed, p_detail, p_note, p_admin_id, p_admin_email)
  returning id into v_hist;

  return jsonb_build_object(
    'kanji_id', p_kanji_id,
    'changed', true,
    'version', v_version,
    'history_id', v_hist,
    'final_ids', to_jsonb(v_final),
    'words_added', cardinality(array(select unnest(v_final) except select unnest(v_prev_final))),
    'words_removed', cardinality(array(select unnest(v_prev_final) except select unnest(v_final)))
  );
end;
$function$;

-- ---------- Push to the other region ----------
-- public.kw_remote_schema() (part 3 / 4) names the foreign schema of the other region. The foreign tables are
-- imported by hand after parts 1 and 2 are applied on BOTH regions (IMPORT FOREIGN SCHEMA, see part 3 / 4).
-- postgres_fdw has no ON CONFLICT DO UPDATE, so rows are replaced with delete + insert. The history insert
-- goes first: a unique violation there means the other region already has a newer version of that kanji.

create or replace function public.kw_push(p_kanji_ids bigint[], p_history_ids uuid[])
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  s text := public.kw_remote_schema();
begin
  if s is null or to_regclass(format('%I.kanji_word_history', s)) is null
     or to_regclass(format('%I.kanji_detail_words', s)) is null then
    raise exception 'kanji_words_remote_missing' using errcode = '55000',
      detail = 'the other region''s kanji-words tables are not imported as foreign tables yet';
  end if;

  begin
    execute format(
      'insert into %I.kanji_word_history (id, kanji_id, version, kind, batch_id, overrides, final_ids, algo_ids, reviewed, detail, note, admin_id, admin_email, created_at) '
      'select id, kanji_id, version, kind, batch_id, overrides, final_ids, algo_ids, reviewed, detail, note, admin_id, admin_email, created_at '
      'from public.kanji_word_history where id = any($1)', s) using p_history_ids;
  exception when unique_violation then
    raise exception 'kanji_words_conflict' using errcode = '40001',
      detail = 'the other region already has a newer version of one of these kanji';
  end;

  execute format('delete from %I.kanji_word_overrides where kanji_id = any($1)', s) using p_kanji_ids;
  execute format(
    'insert into %I.kanji_word_overrides (kanji_id, kanji_word_id, op) '
    'select kanji_id, kanji_word_id, op from public.kanji_word_overrides where kanji_id = any($1)', s) using p_kanji_ids;

  execute format('delete from %I.kanji_word_review where kanji_id = any($1)', s) using p_kanji_ids;
  execute format(
    'insert into %I.kanji_word_review (kanji_id, version, reviewed, reviewed_at, reviewed_by, algo_ids_at_review, updated_at, updated_by) '
    'select kanji_id, version, reviewed, reviewed_at, reviewed_by, algo_ids_at_review, updated_at, updated_by '
    'from public.kanji_word_review where kanji_id = any($1)', s) using p_kanji_ids;

  execute format('delete from %I.kanji_detail_words where kanji_id = any($1)', s) using p_kanji_ids;
  execute format(
    'insert into %I.kanji_detail_words (kanji_id, kanji_word_id, rank) '
    'select kanji_id, kanji_word_id, rank from public.kanji_detail_words where kanji_id = any($1)', s) using p_kanji_ids;
end;
$function$;

-- ---------- Many kanji at once ----------
-- p_items: [{"kanji_id", "expected_version"?, "add"?, "remove"?, "reviewed"?, "review_algo_ids"?, "clear"?}, ...]
-- Returns {batch_id (null for a dry run), dry_run, changed, unchanged, conflicts: [kanji ids], words_added,
-- words_removed}. A kanji whose version moved on is reported under "conflicts" and skipped; the rest still go.

create or replace function public.kw_apply_items(
  p_items jsonb,
  p_kind text,
  p_detail jsonb,
  p_note text,
  p_dry_run boolean,
  p_admin_id uuid,
  p_admin_email text
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  it jsonb;
  v_batch uuid := gen_random_uuid();
  v_res jsonb;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_added integer := 0;
  v_removed integer := 0;
  v_conflicts bigint[] := '{}';
  v_kanji bigint[] := '{}';
  v_hist uuid[] := '{}';
begin
  for it in select e.value from jsonb_array_elements(p_items) e loop
    v_res := null;
    begin
      v_res := public.kw_commit(
        (it->>'kanji_id')::bigint,
        coalesce(array(select x::bigint from jsonb_array_elements_text(it->'add') x), '{}'::bigint[]),
        coalesce(array(select x::bigint from jsonb_array_elements_text(it->'remove') x), '{}'::bigint[]),
        (it->>'reviewed')::boolean,
        case when jsonb_typeof(it->'review_algo_ids') = 'array'
             then array(select x::bigint from jsonb_array_elements_text(it->'review_algo_ids') x) end,
        coalesce((it->>'clear')::boolean, false),
        p_kind, v_batch, p_detail, p_note,
        (it->>'expected_version')::integer,
        p_admin_id, p_admin_email,
        false
      );
      if p_dry_run then
        raise exception 'kw_dry_run';
      end if;
    exception
      when serialization_failure then
        v_conflicts := v_conflicts || (it->>'kanji_id')::bigint;
        v_res := null;
      when raise_exception then
        if sqlerrm <> 'kw_dry_run' then
          raise;
        end if;
    end;

    continue when v_res is null;

    if (v_res->>'changed')::boolean then
      v_changed := v_changed + 1;
      v_added := v_added + (v_res->>'words_added')::integer;
      v_removed := v_removed + (v_res->>'words_removed')::integer;
      if not p_dry_run then
        v_kanji := v_kanji || (v_res->>'kanji_id')::bigint;
        v_hist := v_hist || (v_res->>'history_id')::uuid;
      end if;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  if not p_dry_run and v_changed > 0 then
    perform public.kw_push(v_kanji, v_hist);
  end if;

  return jsonb_build_object(
    'batch_id', case when p_dry_run then null else v_batch end,
    'dry_run', p_dry_run,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'conflicts', to_jsonb(v_conflicts),
    'words_added', v_added,
    'words_removed', v_removed
  );
end;
$function$;

-- ---------- The work item that puts one kanji back in the state of an old version ----------
-- Version 0 = before anyone touched it (no overrides, not reviewed). A "reviewed" version is only restored as
-- reviewed if the algorithm still gives the same list as when it was reviewed; otherwise the kanji comes back
-- not reviewed and flagged "algorithm changed".

create or replace function public.kw_restore_item(p_kanji_id bigint, p_version integer, p_expected_version integer)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  h public.kanji_word_history%rowtype;
  v_algo_now bigint[];
begin
  if p_version = 0 then
    return jsonb_strip_nulls(jsonb_build_object(
      'kanji_id', p_kanji_id, 'expected_version', p_expected_version,
      'add', '[]'::jsonb, 'remove', '[]'::jsonb, 'reviewed', false, 'clear', true));
  end if;

  select * into h from public.kanji_word_history where kanji_id = p_kanji_id and version = p_version;
  if not found then
    raise exception 'kanji_words_unknown_version' using errcode = '22023';
  end if;

  select s.algo_ids into v_algo_now from public.kw_state(p_kanji_id) s;

  return jsonb_strip_nulls(jsonb_build_object(
    'kanji_id', p_kanji_id,
    'expected_version', p_expected_version,
    'add', coalesce(h.overrides->'add', '[]'::jsonb),
    'remove', coalesce(h.overrides->'remove', '[]'::jsonb),
    'reviewed', h.reviewed and h.algo_ids = v_algo_now,
    'review_algo_ids', case when h.reviewed then to_jsonb(h.algo_ids) end,
    'clear', not h.reviewed
  ));
end;
$function$;

-- ---------- Stats of one side, for the parity check ----------

create or replace function public.kw_stats(p_schema text)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  execute format($q$
    select jsonb_build_object(
      'final_rows', (select count(*) from %1$I.kanji_detail_words),
      'final_hash', (select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || rank, ',' order by kanji_id, kanji_word_id)) from %1$I.kanji_detail_words),
      'overrides', (select count(*) from %1$I.kanji_word_overrides),
      'overrides_hash', (select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || op, ',' order by kanji_id, kanji_word_id)) from %1$I.kanji_word_overrides),
      'version_sum', (select coalesce(sum(version), 0) from %1$I.kanji_word_review),
      'reviewed', (select count(*) from %1$I.kanji_word_review where reviewed),
      'history_rows', (select count(*) from %1$I.kanji_word_history)
    )
  $q$, p_schema) into v;
  return v;
end;
$function$;

revoke all on function public.kw_commit(bigint, bigint[], bigint[], boolean, bigint[], boolean, text, uuid, jsonb, text, integer, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.kw_push(bigint[], uuid[]) from public, anon, authenticated;
revoke all on function public.kw_apply_items(jsonb, text, jsonb, text, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.kw_restore_item(bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.kw_stats(text) from public, anon, authenticated;

-- ================= Admin RPCs (read) =================

-- One row per kanji, compact keys (the page filters and sorts on the client, like the student roster):
--   id, k kanji, lv level, m meanings (first 3), kun/on readings,
--   v version, r reviewed, ac "algorithm changed since the last review",
--   f final words and a algorithm words (only when different, else null): [kanji_word_id, word, jlpt_level,
--   signed level gap vs the kanji (a word without a level counts as beyond N1), is_common],
--   lu / lb / lk time, admin and kind of the last change.
create or replace function public.admin_get_kanji_words_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'kanji', coalesce(jsonb_agg(t.row_json order by t.lvl_rank, t.id), '[]'::jsonb)
  ) into v
  from (
    select
      k.id,
      coalesce(array_position(array['N5', 'N4', 'N3', 'N2', 'N1']::text[], k.level), 6) as lvl_rank,
      jsonb_build_object(
        'id', k.id,
        'k', k.kanji,
        'lv', k.level,
        'm', to_jsonb(coalesce(k.meanings[1:3], '{}'::text[])),
        'kun', to_jsonb(coalesce(k.kun_readings, '{}'::text[])),
        'on', to_jsonb(coalesce(k.on_readings, '{}'::text[])),
        'v', coalesce(rv.version, 0),
        'r', coalesce(rv.reviewed, false),
        'ac', (rv.algo_ids_at_review is not null
               and rv.algo_ids_at_review is distinct from coalesce(algo.ids, '{}'::bigint[])),
        'f', coalesce(fin.words, '[]'::jsonb),
        'a', case when coalesce(fin.ids, '{}'::bigint[]) = coalesce(algo.ids, '{}'::bigint[])
                  then null else coalesce(algo.words, '[]'::jsonb) end,
        'lu', lh.created_at,
        'lb', lh.admin_email,
        'lk', lh.kind
      ) as row_json
    from public.kanji k
    left join public.kanji_word_review rv on rv.kanji_id = k.id
    left join lateral (
      select array_agg(d.kanji_word_id order by d.kanji_word_id) as ids,
             jsonb_agg(jsonb_build_array(d.kanji_word_id, vo.word, vo.jlpt_level, sk.signed_gap, coalesce(vo.is_common_jisho, false))
                       order by d.rank) as words
      from public.kanji_detail_words d
      join public.kanji_word kw on kw.id = d.kanji_word_id
      join public.vocabulary vo on vo.id = kw.id_word
      join public.kanji_word_sort_keys sk on sk.kanji_word_id = d.kanji_word_id
      where d.kanji_id = k.id
    ) fin on true
    left join lateral (
      select array_agg(a.kanji_word_id order by a.kanji_word_id) as ids,
             jsonb_agg(jsonb_build_array(a.kanji_word_id, vo.word, vo.jlpt_level, sk.signed_gap, coalesce(vo.is_common_jisho, false))
                       order by a.rank) as words
      from public.kanji_detail_words_algo a
      join public.kanji_word kw on kw.id = a.kanji_word_id
      join public.vocabulary vo on vo.id = kw.id_word
      join public.kanji_word_sort_keys sk on sk.kanji_word_id = a.kanji_word_id
      where a.kanji_id = k.id
    ) algo on true
    left join lateral (
      select h.created_at, h.admin_email, h.kind
      from public.kanji_word_history h
      where h.kanji_id = k.id
      order by h.version desc
      limit 1
    ) lh on true
  ) t;

  return v;
end;
$function$;

-- Every candidate of one kanji (all words that contain it), with what the editor shows.
create or replace function public.admin_get_kanji_word_candidates(p_kanji_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'kanji', jsonb_build_object(
      'id', k.id, 'k', k.kanji, 'lv', k.level,
      'meanings', to_jsonb(coalesce(k.meanings, '{}'::text[])),
      'kun', to_jsonb(coalesce(k.kun_readings, '{}'::text[])),
      'on', to_jsonb(coalesce(k.on_readings, '{}'::text[]))),
    'version', coalesce(rv.version, 0),
    'reviewed', coalesce(rv.reviewed, false),
    'algo_ids_at_review', to_jsonb(rv.algo_ids_at_review),
    'candidates', coalesce((
      select jsonb_agg(c.obj order by c.reading_group, c.tier, c.level_gap, c.is_common desc, c.freq_score desc, c.id)
      from (
        select
          kw.id, sk.reading_group, sk.tier, sk.level_gap, sk.is_common, sk.freq_score,
          jsonb_build_object(
            'id', kw.id,
            'word', vo.word,
            'kana', vo.kana_reading,
            'furiganas', to_jsonb(vo.furiganas),
            'meanings', to_jsonb(public.vocabulary_primary_meanings(vo)),
            'jlpt', vo.jlpt_level,
            'gap', sk.signed_gap,
            'common', coalesce(vo.is_common_jisho, false),
            'freq', sk.freq_score,
            'rg', kw.reading_group,
            'enabled', vo.study_enabled,
            'usually_kana', coalesce(vo.usually_kana, false),
            'rank', d.rank,
            'in_final', d.kanji_word_id is not null,
            'in_algo', a.kanji_word_id is not null,
            'override', o.op,
            'students', coalesce(st.n, 0),
            'info', case when ai.kanji_word_id is null then null else jsonb_build_object(
              'cand_class', ai.cand_class,
              'in_class', ai.in_class,
              'group_size', ai.group_size,
              'group_rank', ai.group_rank,
              'group_selected', ai.group_selected,
              'pick_kind', ai.pick_kind,
              'dup_of', ai.dup_of,
              'dup_of_word', dvo.word,
              'champion', champ.kanji_word_id,
              'champion_word', champ.word) end
          ) as obj
        from public.kanji_word kw
        join public.vocabulary vo on vo.id = kw.id_word
        join public.kanji_word_sort_keys sk on sk.kanji_word_id = kw.id
        left join public.kanji_detail_words d on d.kanji_id = kw.id_kanji and d.kanji_word_id = kw.id
        left join public.kanji_detail_words_algo a on a.kanji_id = kw.id_kanji and a.kanji_word_id = kw.id
        left join public.kanji_word_overrides o on o.kanji_id = kw.id_kanji and o.kanji_word_id = kw.id
        left join public.kanji_word_algo_info ai on ai.kanji_id = kw.id_kanji and ai.kanji_word_id = kw.id
        left join public.kanji_word dkw on dkw.id = ai.dup_of
        left join public.vocabulary dvo on dvo.id = dkw.id_word
        left join lateral (
          select ckw.id as kanji_word_id, cvo.word
          from public.kanji_word_algo_info cai
          join public.kanji_word ckw on ckw.id = cai.kanji_word_id
          join public.vocabulary cvo on cvo.id = ckw.id_word
          where cai.kanji_id = kw.id_kanji and cai.pick_kind = 'champion' and ckw.reading_group = kw.reading_group
          limit 1
        ) champ on true
        left join (
          select p.kanji_word_id, count(distinct p.user_id)::integer as n
          from admin_all.user_kanji_reading_progress p
          where p.kanji_id = p_kanji_id
          group by p.kanji_word_id
        ) st on st.kanji_word_id = kw.id
        where kw.id_kanji = p_kanji_id
      ) c
    ), '[]'::jsonb)
  ) into v
  from public.kanji k
  left join public.kanji_word_review rv on rv.kanji_id = k.id
  where k.id = p_kanji_id;

  if v is null then
    raise exception 'kanji_words_unknown_kanji' using errcode = '22023';
  end if;
  return v;
end;
$function$;

-- Versions of one kanji, newest first, plus the words they mention ({kanji_word_id: [word, jlpt_level]}).
create or replace function public.admin_get_kanji_words_history(p_kanji_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', h.version, 'kind', h.kind, 'batch_id', h.batch_id, 'note', h.note,
        'admin_email', h.admin_email, 'created_at', h.created_at, 'reviewed', h.reviewed,
        'add', h.overrides->'add', 'remove', h.overrides->'remove',
        'final_ids', to_jsonb(h.final_ids), 'algo_ids', to_jsonb(h.algo_ids), 'detail', h.detail
      ) order by h.version desc)
      from public.kanji_word_history h where h.kanji_id = p_kanji_id
    ), '[]'::jsonb),
    'words', coalesce((
      select jsonb_object_agg(kw.id::text, jsonb_build_array(vo.word, vo.jlpt_level))
      from public.kanji_word kw
      join public.vocabulary vo on vo.id = kw.id_word
      where kw.id_kanji = p_kanji_id
    ), '{}'::jsonb)
  ) into v;
  return v;
end;
$function$;

-- Recent bulk operations / undos / restores, so a batch can be undone later than right after it ran.
-- "undoable" = how many of its kanji are still at the version the batch left them in.
create or replace function public.admin_get_kanji_words_batches(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(b.obj order by b.created_at desc), '[]'::jsonb) into v
  from (
    select min(h.created_at) as created_at,
           jsonb_build_object(
             'batch_id', h.batch_id,
             'kind', min(h.kind),
             'created_at', min(h.created_at),
             'admin_email', min(h.admin_email),
             'note', min(h.note),
             'detail', (array_agg(h.detail))[1],
             'kanji', count(*),
             'undoable', count(*) filter (where rv.version = h.version)
           ) as obj
    from public.kanji_word_history h
    left join public.kanji_word_review rv on rv.kanji_id = h.kanji_id
    where h.batch_id is not null
    group by h.batch_id
    order by min(h.created_at) desc
    limit greatest(coalesce(p_limit, 30), 1)
  ) b;
  return v;
end;
$function$;

-- The number on the /admin Overview tile.
create or replace function public.admin_get_kanji_words_todo_count()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'reviewed', count(*) filter (where coalesce(rv.reviewed, false)),
    'to_review', count(*) filter (where not coalesce(rv.reviewed, false)),
    'algo_changed', count(*) filter (
      where rv.algo_ids_at_review is not null
        and rv.algo_ids_at_review is distinct from coalesce(algo.ids, '{}'::bigint[]))
  ) into v
  from public.kanji k
  left join public.kanji_word_review rv on rv.kanji_id = k.id
  left join lateral (
    select array_agg(a.kanji_word_id order by a.kanji_word_id) as ids
    from public.kanji_detail_words_algo a where a.kanji_id = k.id
  ) algo on true;
  return v;
end;
$function$;

-- Is the other region holding the same choices? (Writes keep them equal; this catches drift, e.g. a write
-- that only landed on one side, or a rebuild run on one region only.)
create or replace function public.admin_kanji_words_parity()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
  v_local jsonb;
  v_remote jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  s := public.kw_remote_schema();
  v_local := public.kw_stats('public');

  if s is null or to_regclass(format('%I.kanji_detail_words', s)) is null
     or to_regclass(format('%I.kanji_word_overrides', s)) is null
     or to_regclass(format('%I.kanji_word_review', s)) is null
     or to_regclass(format('%I.kanji_word_history', s)) is null then
    return jsonb_build_object('in_sync', null, 'error', 'kanji_words_remote_missing', 'local', v_local);
  end if;

  v_remote := public.kw_stats(s);
  return jsonb_build_object(
    'in_sync',
      (v_local->'final_hash') = (v_remote->'final_hash')
      and (v_local->'overrides_hash') is not distinct from (v_remote->'overrides_hash')
      and (v_local->'version_sum') = (v_remote->'version_sum')
      and (v_local->'reviewed') = (v_remote->'reviewed'),
    'local', v_local,
    'remote', v_remote
  );
end;
$function$;

-- ================= Admin RPCs (write) =================

-- Save the editor: p_word_ids is the COMPLETE list the admin wants (kanji_word ids). p_reviewed true (the
-- editor's default) also marks the kanji reviewed; null leaves the mark as it is.
create or replace function public.admin_save_kanji_words(
  p_kanji_id bigint,
  p_word_ids bigint[],
  p_expected_version integer,
  p_note text default null,
  p_reviewed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_algo bigint[];
  v_add bigint[];
  v_remove bigint[];
  v_res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_expected_version is null then
    raise exception 'kanji_words_expected_version_required' using errcode = '22023';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);
  select s.algo_ids into v_algo from public.kw_state(p_kanji_id) s;

  v_add := array(select x from unnest(coalesce(p_word_ids, '{}'::bigint[])) x where x <> all(v_algo));
  v_remove := array(select x from unnest(v_algo) x where x <> all(coalesce(p_word_ids, '{}'::bigint[])));

  v_res := public.kw_commit(
    p_kanji_id, v_add, v_remove, p_reviewed, null, false,
    'save', null, null, nullif(btrim(p_note), ''), p_expected_version, v_uid, v_email, true);

  if (v_res->>'changed')::boolean then
    perform public.kw_push(array[p_kanji_id], array[(v_res->>'history_id')::uuid]);
  end if;
  return v_res;
end;
$function$;

-- Put one kanji back in the state of an earlier version (0 = untouched). Never rewrites history: it is a new version.
create or replace function public.admin_restore_kanji_words_version(
  p_kanji_id bigint,
  p_version integer,
  p_expected_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_expected_version is null then
    raise exception 'kanji_words_expected_version_required' using errcode = '22023';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);
  v_res := public.kw_apply_items(
    jsonb_build_array(public.kw_restore_item(p_kanji_id, p_version, p_expected_version)),
    'restore', jsonb_build_object('restored_version', p_version), nullif(btrim(p_note), ''), false, v_uid, v_email);

  if jsonb_array_length(v_res->'conflicts') > 0 then
    raise exception 'kanji_words_conflict' using errcode = '40001';
  end if;
  return v_res;
end;
$function$;

-- Bulk operations on a list of kanji (the page passes the filtered / selected ones and their loaded versions):
--   remove_gap {"min_gap": n}  drop every word whose level gap vs the kanji is >= n (n 1..6; a word with no JLPT
--                              level counts as beyond N1, like the algorithm does)
--   reset                      back to exactly what the algorithm picks
--   review {"reviewed": bool}  set / clear the reviewed mark (default true)
-- p_dry_run (the default) only counts. p_expected_versions: {"<kanji id>": version}; a kanji that moved on is
-- skipped and reported under "conflicts".
create or replace function public.admin_bulk_kanji_words(
  p_kanji_ids bigint[],
  p_op text,
  p_params jsonb default '{}'::jsonb,
  p_expected_versions jsonb default null,
  p_note text default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_items jsonb := '[]'::jsonb;
  v_min_gap integer;
  v_reviewed boolean;
  v_kind text;
  v_k bigint;
  s record;
  v_drop bigint[];
  v_add bigint[];
  v_remove bigint[];
  v_res jsonb;
  v_considered integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_op not in ('remove_gap', 'reset', 'review') then
    raise exception 'kanji_words_unknown_op' using errcode = '22023';
  end if;
  if p_kanji_ids is null or cardinality(p_kanji_ids) = 0 then
    raise exception 'kanji_words_no_kanji' using errcode = '22023';
  end if;

  if p_op = 'remove_gap' then
    v_min_gap := coalesce((p_params->>'min_gap')::integer, 2);
    if v_min_gap not between 1 and 6 then
      raise exception 'kanji_words_bad_min_gap' using errcode = '22023';
    end if;
  elsif p_op = 'review' then
    v_reviewed := coalesce((p_params->>'reviewed')::boolean, true);
  end if;
  v_kind := case p_op when 'review' then 'review' when 'reset' then 'reset' else 'bulk' end;
  v_email := (select u.email from public.users u where u.id = v_uid);

  for v_k in select distinct x from unnest(p_kanji_ids) x order by x loop
    v_considered := v_considered + 1;
    select * into s from public.kw_state(v_k);

    if p_op = 'remove_gap' then
      v_drop := array(
        select sk.kanji_word_id from public.kanji_word_sort_keys sk
        where sk.kanji_word_id = any(s.final_ids) and sk.level_gap >= v_min_gap);
      continue when cardinality(v_drop) = 0;
      v_add := array(select x from unnest(s.add_ids) x where x <> all(v_drop));
      v_remove := array(
        select x from (
          select unnest(s.remove_ids) as x
          union
          select d from unnest(v_drop) d where d = any(s.algo_ids)
        ) u order by x);
    elsif p_op = 'reset' then
      v_add := '{}';
      v_remove := '{}';
    else
      v_add := s.add_ids;
      v_remove := s.remove_ids;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kanji_id', v_k,
      'expected_version', (p_expected_versions->>(v_k::text))::integer,
      'add', to_jsonb(v_add),
      'remove', to_jsonb(v_remove),
      'reviewed', v_reviewed
    )));
  end loop;

  v_res := public.kw_apply_items(
    v_items, v_kind, jsonb_build_object('op', p_op, 'params', coalesce(p_params, '{}'::jsonb)),
    nullif(btrim(p_note), ''), p_dry_run, v_uid, v_email);

  return v_res || jsonb_build_object('kanji_considered', v_considered);
end;
$function$;

-- Undo a whole batch: every kanji still at the version the batch left it in goes back to the version before.
-- Kanji changed since (by anyone) are left alone and counted under "skipped_changed_since".
create or replace function public.admin_undo_kanji_words_batch(
  p_batch_id uuid,
  p_dry_run boolean default true,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_skipped integer := 0;
  h record;
  v_res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.kanji_word_history where batch_id = p_batch_id) then
    raise exception 'kanji_words_unknown_batch' using errcode = '22023';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);

  for h in
    select hh.kanji_id, hh.version, coalesce(rv.version, 0) as current_version
    from public.kanji_word_history hh
    left join public.kanji_word_review rv on rv.kanji_id = hh.kanji_id
    where hh.batch_id = p_batch_id
    order by hh.kanji_id
  loop
    v_total := v_total + 1;
    if h.current_version <> h.version then
      v_skipped := v_skipped + 1;
    else
      v_items := v_items || jsonb_build_array(public.kw_restore_item(h.kanji_id, h.version - 1, h.version));
    end if;
  end loop;

  v_res := public.kw_apply_items(
    v_items, 'undo_batch', jsonb_build_object('undo_of', p_batch_id), nullif(btrim(p_note), ''),
    p_dry_run, v_uid, v_email);

  return v_res || jsonb_build_object('batch_kanji', v_total, 'skipped_changed_since', v_skipped);
end;
$function$;

-- Put EVERY kanji back as it was at a moment: each kanji goes to its last version at or before p_at (or to
-- untouched if it had none yet). A kanji already there is left alone.
create or replace function public.admin_restore_kanji_words_to(
  p_at timestamptz,
  p_dry_run boolean default true,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_items jsonb := '[]'::jsonb;
  h record;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_at is null then
    raise exception 'kanji_words_no_moment' using errcode = '22023';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);

  for h in
    select k.kanji_id,
           coalesce((select max(x.version) from public.kanji_word_history x
                     where x.kanji_id = k.kanji_id and x.created_at <= p_at), 0) as target_version,
           coalesce(rv.version, 0) as current_version
    from (select distinct kanji_id from public.kanji_word_history) k
    left join public.kanji_word_review rv on rv.kanji_id = k.kanji_id
    order by k.kanji_id
  loop
    continue when h.target_version = h.current_version;
    v_items := v_items || jsonb_build_array(public.kw_restore_item(h.kanji_id, h.target_version, h.current_version));
  end loop;

  return public.kw_apply_items(
    v_items, 'restore_all', jsonb_build_object('restore_to', p_at), nullif(btrim(p_note), ''),
    p_dry_run, v_uid, v_email);
end;
$function$;

-- ---------- Who may call what ----------

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_get_kanji_words_overview()',
    'admin_get_kanji_word_candidates(bigint)',
    'admin_get_kanji_words_history(bigint)',
    'admin_get_kanji_words_batches(integer)',
    'admin_get_kanji_words_todo_count()',
    'admin_kanji_words_parity()',
    'admin_save_kanji_words(bigint, bigint[], integer, text, boolean)',
    'admin_restore_kanji_words_version(bigint, integer, integer, text)',
    'admin_bulk_kanji_words(bigint[], text, jsonb, jsonb, text, boolean)',
    'admin_undo_kanji_words_batch(uuid, boolean, text)',
    'admin_restore_kanji_words_to(timestamptz, boolean, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- EU-new + US-new BOTH, identical text. Part 1 of 3 of the "reviewed" mark on a word in /admin/kanji-words: in the
-- word popup (the pencil on a word card) an admin marks the word's dictionary data as checked, and its card gets a
-- green wash in the kanji's list of words. Parts 2/3 (_remote_eu / _remote_us) import the table it writes on the
-- other region as a foreign table.
--
-- The mark belongs to the WORD (vocabulary), not to one kanji's list: 日本 marked from 日 shows as reviewed under 本
-- too, since the popup checks the word's own data. One row per marked word; unmarking deletes the row. Like every
-- other kanji-words write, it goes to the admin's own region and the other one (kw_remote_schema()) in ONE
-- transaction, so both regions always hold the same marks.
--
-- 1. vocabulary_review: the marks, with who and when.
-- 2. admin_set_vocabulary_reviewed(p_vocabulary_id, p_reviewed): mark / unmark, admins only. Idempotent: marking a
--    word already marked keeps the first mark (who / when) and still copies it to the other region.
-- 3. admin_get_kanji_word_candidates (same signature, same rights): every candidate also carries `reviewed`, null or
--    {at, by}. The body is otherwise byte-identical to 20261011040512_kanji_words_admin_meanings.sql (checked
--    against pg_get_functiondef on both projects before writing this).
--
-- Errors (message text): vocabulary_unknown, vocabulary_remote_missing (parts 2/3 not applied yet).

-- ---------- The marks ----------

create table public.vocabulary_review (
  -- no foreign key on purpose, like vocabulary_edits: nothing a reference-data refresh does may be blocked by a mark
  vocabulary_id bigint primary key,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_by_email text
);

-- New public tables are granted ALL to anon/authenticated by default here; clients only ever go through the RPCs.
alter table public.vocabulary_review enable row level security;
revoke all on table public.vocabulary_review from public, anon, authenticated;

-- ---------- Admin RPC ----------

-- Mark (p_reviewed true) or unmark one word, on both regions. Returns {changed (the mark here changed), reviewed (null
-- or {at, by}), kanji_word_ids (every kanji_word row of the word, for the page to refresh its cards)}.
create or replace function public.admin_set_vocabulary_reviewed(p_vocabulary_id bigint, p_reviewed boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text := public.kw_remote_schema();
  v_uid uuid := auth.uid();
  v_mark public.vocabulary_review;
  v_n integer;
  v_kanji_word_ids jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_reviewed is null then
    raise exception 'vocabulary_invalid' using errcode = '22023', detail = 'Say whether the word is reviewed or not.';
  end if;
  perform 1 from public.vocabulary where id = p_vocabulary_id;
  if not found then
    raise exception 'vocabulary_unknown' using errcode = '22023';
  end if;
  if s is null or to_regclass(format('%I.vocabulary_review', s)) is null then
    raise exception 'vocabulary_remote_missing' using errcode = '55000',
      detail = 'the other region''s vocabulary_review table is not imported as a foreign table yet';
  end if;

  if p_reviewed then
    insert into public.vocabulary_review (vocabulary_id, reviewed_by, reviewed_by_email)
    values (p_vocabulary_id, v_uid, (select u.email from public.users u where u.id = v_uid))
    on conflict (vocabulary_id) do nothing;
    get diagnostics v_n = row_count;
    select * into v_mark from public.vocabulary_review where vocabulary_id = p_vocabulary_id;
    -- The other region gets exactly this row, whatever it held before.
    execute format('delete from %I.vocabulary_review where vocabulary_id = $1', s) using p_vocabulary_id;
    execute format(
      'insert into %I.vocabulary_review (vocabulary_id, reviewed_at, reviewed_by, reviewed_by_email) '
      'values ($1, $2, $3, $4)', s)
    using v_mark.vocabulary_id, v_mark.reviewed_at, v_mark.reviewed_by, v_mark.reviewed_by_email;
  else
    delete from public.vocabulary_review where vocabulary_id = p_vocabulary_id;
    get diagnostics v_n = row_count;
    execute format('delete from %I.vocabulary_review where vocabulary_id = $1', s) using p_vocabulary_id;
  end if;

  v_kanji_word_ids := to_jsonb(array(
    select kw.id from public.kanji_word kw where kw.id_word = p_vocabulary_id order by kw.id));

  return jsonb_build_object(
    'changed', v_n > 0,
    'reviewed', case when p_reviewed
      then jsonb_build_object('at', v_mark.reviewed_at, 'by', v_mark.reviewed_by_email) end,
    'kanji_word_ids', v_kanji_word_ids);
end;
$function$;

revoke all on function public.admin_set_vocabulary_reviewed(bigint, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_vocabulary_reviewed(bigint, boolean) to authenticated;

-- ---------- Candidates carry the mark ----------

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
            'short', nullif(trim(vo.short_meaning), ''),
            'primary', coalesce(to_jsonb(vo.primary_meanings), '[]'::jsonb),
            'other', coalesce(vo.other_meanings, '[]'::jsonb),
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
            'reviewed', case when vr.vocabulary_id is null then null
              else jsonb_build_object('at', vr.reviewed_at, 'by', vr.reviewed_by_email) end,
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
        left join public.vocabulary_review vr on vr.vocabulary_id = vo.id
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

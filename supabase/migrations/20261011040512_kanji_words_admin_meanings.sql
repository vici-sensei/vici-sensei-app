-- Scope: both live projects (EU-new + US-new), identical text. The frozen project (hmbemylaqnkiamvhcdcd)
-- has no kanji-words admin RPCs and does not get it.
--
-- /admin/kanji-words shows every word's short meaning, primary meanings and secondary meanings apart from
-- one another. Until now admin_get_kanji_word_candidates only sent `meanings` (vocabulary_primary_meanings():
-- the short meaning glued in front of the primary ones) and no secondary meanings at all.
--
-- 1. admin_get_kanji_word_candidates (same signature, same rights): every candidate also carries
--    `short` (vocabulary.short_meaning, trimmed, null when empty), `primary` (vocabulary.primary_meanings)
--    and `other` (vocabulary.other_meanings, one array per secondary sense). `meanings` stays as it was.
--    The body is otherwise byte-identical to 20261007064452_kanji_words_admin_rpcs.sql (checked against
--    pg_get_functiondef on both projects before writing this).
-- 2. admin_get_kanji_words_meanings(p_kanji_word_ids): {kanji_word_id: [short, primary, other]} for the
--    words of the kanji list's chips, loaded in the background after the overview. NULL = every word that
--    is in a final or an algorithm list (~4,500 words, ~420 KB); an array = just those ids (words a save
--    has just added). Admins only, like every other admin_* kanji-words RPC.

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


create or replace function public.admin_get_kanji_words_meanings(p_kanji_word_ids bigint[] default null)
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

  select coalesce(jsonb_object_agg(
    kw.id::text,
    jsonb_build_array(
      nullif(trim(vo.short_meaning), ''),
      coalesce(to_jsonb(vo.primary_meanings), '[]'::jsonb),
      coalesce(vo.other_meanings, '[]'::jsonb))), '{}'::jsonb)
  into v
  from public.kanji_word kw
  join public.vocabulary vo on vo.id = kw.id_word
  where kw.id in (
    select ids.id
    from unnest(p_kanji_word_ids) as ids(id)
    where p_kanji_word_ids is not null
    union
    select d.kanji_word_id from public.kanji_detail_words d where p_kanji_word_ids is null
    union
    select a.kanji_word_id from public.kanji_detail_words_algo a where p_kanji_word_ids is null
  );

  return v;
end;
$function$;

revoke all on function public.admin_get_kanji_words_meanings(bigint[]) from public, anon, authenticated;
grant execute on function public.admin_get_kanji_words_meanings(bigint[]) to authenticated;

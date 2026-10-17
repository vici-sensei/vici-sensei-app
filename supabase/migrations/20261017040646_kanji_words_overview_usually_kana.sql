-- EU-new + US-new BOTH, identical text. The frozen project (hmbemylaqnkiamvhcdcd) has no kanji-words admin RPCs and
-- does not get it.
--
-- /admin/kanji-words: a word chip of the kanji list shows a usually-kana word in kana, like a card shows it to a
-- student (showsKanaOnly() in lib/study/furigana.tsx: usually_kana and a non-empty kana_reading). The overview
-- (same signature, same rights) adds that kana as a 7th element of every [kanji_word_id, word, jlpt_level, gap,
-- is_common, furiganas] tuple, in the final (`f`) and the algorithm (`a`) lists: the kana_reading when the word is
-- shown in kana, null otherwise. Otherwise the body is byte-identical to
-- 20261017035637_kanji_words_overview_furigana.sql (live on EU and US, pg_get_functiondef md5 6143f3aa... on both).
-- Pages older than this ignore the extra element. Changes no data.

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
             jsonb_agg(jsonb_build_array(d.kanji_word_id, vo.word, vo.jlpt_level, sk.signed_gap, coalesce(vo.is_common_jisho, false),
                                         to_jsonb(vo.furiganas),
                                         case when vo.usually_kana and nullif(vo.kana_reading, '') is not null
                                              then vo.kana_reading end)
                       order by d.rank) as words
      from public.kanji_detail_words d
      join public.kanji_word kw on kw.id = d.kanji_word_id
      join public.vocabulary vo on vo.id = kw.id_word
      join public.kanji_word_sort_keys sk on sk.kanji_word_id = d.kanji_word_id
      where d.kanji_id = k.id
    ) fin on true
    left join lateral (
      select array_agg(a.kanji_word_id order by a.kanji_word_id) as ids,
             jsonb_agg(jsonb_build_array(a.kanji_word_id, vo.word, vo.jlpt_level, sk.signed_gap, coalesce(vo.is_common_jisho, false),
                                         to_jsonb(vo.furiganas),
                                         case when vo.usually_kana and nullif(vo.kana_reading, '') is not null
                                              then vo.kana_reading end)
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

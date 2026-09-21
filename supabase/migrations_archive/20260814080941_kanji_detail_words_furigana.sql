-- get_kanji_detail_words now also returns vocabulary.furiganas, so the
-- "Example words" list on /browse/kanji/detail can render furigana above
-- each word instead of a separate kana_reading line.

DROP FUNCTION public.get_kanji_detail_words(bigint);

CREATE FUNCTION public.get_kanji_detail_words(p_kanji_id bigint)
 RETURNS TABLE(kanji_word_id bigint, reading_group integer, word text, kana_reading text, meanings text[], furiganas text[])
 LANGUAGE sql
 STABLE
AS $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, v.meanings, v.furiganas
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
  order by kdw.rank;
$function$
;

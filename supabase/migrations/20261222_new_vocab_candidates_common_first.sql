-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_new_vocab_candidates ordered strictly by frequency_number desc, which
-- means a rare-but-technically-frequent word (e.g. a proper noun or a
-- corpus-specific term) could outrank a genuinely common everyday word that
-- happens to have a lower BCCWJ count. Ordering by is_common_jisho desc first
-- surfaces every common word (16803/17349 rows) before any uncommon one,
-- with frequency_number desc still deciding the order within each of those
-- two groups.

create or replace function public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer)
returns table(id bigint, word text, kana_reading text, primary_meanings text[], parts_of_speech text[], jlpt_level text, usually_kana boolean, furiganas text[])
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and v.study_enabled
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.is_common_jisho desc, v.frequency_number desc, v.id asc
  limit p_limit;
$function$;

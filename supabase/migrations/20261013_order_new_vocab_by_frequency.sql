-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_new_vocab_candidates ordered strictly by v.id asc within the enabled
-- levels, which is really just import order -- unrelated to how useful the
-- word actually is. Checked against the live table: id-order vs.
-- frequency_number-order correlate only weakly per level (Spearman
-- 0.19-0.44), so within a level the id order is close to arbitrary.
--
-- frequency_number is a raw BCCWJ corpus occurrence count (bigger = more
-- common), fully populated (17349/17349 vocabulary rows). Switching the new-
-- vocabulary order to frequency_number desc means a user who studies a level
-- surfaces its most commonly-used words first, so even someone who never
-- finishes a level still learns its highest-value words first. `v.id asc` is
-- kept as a tiebreak for rows sharing the same frequency_number, purely for
-- deterministic ordering.

create or replace function public.get_new_vocab_candidates(
  p_user_id uuid,
  p_enabled_levels text[],
  p_limit integer
)
returns table (
  id bigint,
  word text,
  kana_reading text,
  meanings text[],
  parts_of_speech text[],
  jlpt_level text,
  usually_kana boolean,
  furiganas text[]
)
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.frequency_number desc, v.id asc
  limit p_limit;
$function$;

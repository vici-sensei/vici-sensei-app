-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Extends get_unresolved_vocabulary_matches() (20261118_get_unresolved_vocabulary_matches_rpc.sql)
-- with fields the admin review page needs to show but didn't yet: the vocabulary row's own
-- parts_of_speech/is_common_jisho/jlpt_level, and each candidate's is_common_jisho. Postgres
-- can't CREATE OR REPLACE a function into a different return shape, so this drops and recreates.

drop function if exists public.get_unresolved_vocabulary_matches();

create function public.get_unresolved_vocabulary_matches()
returns table (
  vocab_id bigint,
  vocab_word text,
  vocab_kana text,
  vocab_meanings text[],
  vocab_parts_of_speech text[],
  vocab_is_common_jisho boolean,
  vocab_jlpt_level text,
  candidates jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.word,
    v.kana_reading,
    v.meanings,
    v.parts_of_speech,
    v.is_common_jisho,
    v.jlpt_level,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'jrow_id', j.id,
          'jmdict_id', j.jmdict_id,
          'word', j.word,
          'kana_reading', j.kana_reading,
          'meanings', j.meanings,
          'parts_of_speech', j.parts_of_speech,
          'is_common_jisho', j.is_common_jisho,
          'already_linked_to_vocab_id', j.vocabulary_id
        ) order by j.id)
        from public.jmdict_entries j
        where j.kana_reading = v.kana_reading
          and (j.word = v.word or (j.word is null and v.word = v.kana_reading))
      ),
      (
        select jsonb_agg(jsonb_build_object(
          'jrow_id', j2.id,
          'jmdict_id', j2.jmdict_id,
          'word', j2.word,
          'kana_reading', j2.kana_reading,
          'meanings', j2.meanings,
          'parts_of_speech', j2.parts_of_speech,
          'is_common_jisho', j2.is_common_jisho,
          'already_linked_to_vocab_id', j2.vocabulary_id
        ) order by j2.id)
        from (
          select * from public.jmdict_entries j2
          where j2.kana_reading = v.kana_reading or j2.word = v.word
          order by j2.id
          limit 8
        ) j2
      ),
      '[]'::jsonb
    ) as candidates
  from public.vocabulary v
  where not exists (select 1 from public.jmdict_entries j3 where j3.vocabulary_id = v.id)
    and not v.jmdict_match_reviewed
  order by v.kana_reading;
$$;

revoke execute on function public.get_unresolved_vocabulary_matches() from public, anon;
grant execute on function public.get_unresolved_vocabulary_matches() to authenticated;

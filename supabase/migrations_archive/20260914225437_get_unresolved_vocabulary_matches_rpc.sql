-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Powers the admin review page (app/(shell)/admin/jmdict-review/page.tsx): for each vocabulary
-- row not yet linked to a jmdict_entries row (and not yet confirmed as having no match),
-- computes its candidate jmdict_entries rows live -- same join/fallback logic used for the bulk
-- vocabulary<->jmdict_entries linking (see 20261116_jmdict_entries_vocabulary_id.sql and
-- scripts/link-vocabulary-jmdict.mjs) -- so this stays self-maintaining as vocabulary/jmdict_entries
-- change (new vocabulary words, a future JMdict re-import), unlike a one-off precomputed list.
--
-- already_linked_to_vocab_id flags a candidate that's already claimed by a DIFFERENT vocabulary
-- row (jmdict_entries.vocabulary_id is unique, so picking it here would silently steal it) -- the
-- page disables those options rather than letting an admin create that footgun.

create or replace function public.get_unresolved_vocabulary_matches()
returns table (
  vocab_id bigint,
  vocab_word text,
  vocab_kana text,
  vocab_meanings text[],
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
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'jrow_id', j.id,
          'jmdict_id', j.jmdict_id,
          'word', j.word,
          'kana_reading', j.kana_reading,
          'meanings', j.meanings,
          'parts_of_speech', j.parts_of_speech,
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

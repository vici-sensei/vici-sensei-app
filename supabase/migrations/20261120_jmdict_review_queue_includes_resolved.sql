-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The jmdict review page (app/(shell)/admin/jmdict-review/page.tsx) used to have the admin's pick
-- vanish from the list the instant it saved, with no way back short of a manual DB fix. Adding an
-- Undo button to the page itself needs the review queue to keep surfacing a row after it's
-- resolved, for a while -- and, since that's driven by the database rather than only client-side
-- state, it survives a refresh, a closed tab, or even a different browser/device, not just the
-- one that made the change.
--
-- matched_at/jmdict_match_reviewed_at record *when* each of the two resolution paths happened, so
-- the queue can bound "recently resolved" to a rolling window instead of returning literally
-- every review ever done.

alter table public.jmdict_entries add column matched_at timestamptz;
alter table public.vocabulary add column jmdict_match_reviewed_at timestamptz;

grant update (matched_at) on public.jmdict_entries to authenticated;
grant update (jmdict_match_reviewed_at) on public.vocabulary to authenticated;

drop function if exists public.get_unresolved_vocabulary_matches();

create function public.get_vocabulary_match_review_queue()
returns table (
  vocab_id bigint,
  vocab_word text,
  vocab_kana text,
  vocab_meanings text[],
  vocab_parts_of_speech text[],
  vocab_is_common_jisho boolean,
  vocab_jlpt_level text,
  candidates jsonb,
  -- null while still unresolved; otherwise {"type": "match", "jrow_id": ...} or
  -- {"type": "no_match"} -- see resolveJmdictMatch/confirmNoMatch (lib/client-data/jmdictReview.ts).
  resolution jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with queue as (
    select
      v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.is_common_jisho, v.jlpt_level,
      null::jsonb as resolution
    from public.vocabulary v
    where not exists (select 1 from public.jmdict_entries j3 where j3.vocabulary_id = v.id)
      and not v.jmdict_match_reviewed

    union all

    -- Only match_method = 'manual' -- the vast bulk of already-linked vocabulary (matched
    -- automatically by scripts/link-vocabulary-jmdict.mjs) never went through this review queue
    -- and shouldn't suddenly appear in it now just because it happens to be linked.
    select
      v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.is_common_jisho, v.jlpt_level,
      jsonb_build_object('type', 'match', 'jrow_id', j.id) as resolution
    from public.vocabulary v
    join public.jmdict_entries j on j.vocabulary_id = v.id
    where j.match_method = 'manual'
      and j.matched_at > now() - interval '7 days'

    union all

    select
      v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.is_common_jisho, v.jlpt_level,
      jsonb_build_object('type', 'no_match') as resolution
    from public.vocabulary v
    where v.jmdict_match_reviewed
      and not exists (select 1 from public.jmdict_entries j4 where j4.vocabulary_id = v.id)
      and v.jmdict_match_reviewed_at > now() - interval '7 days'
  )
  select
    queue.id,
    queue.word,
    queue.kana_reading,
    queue.meanings,
    queue.parts_of_speech,
    queue.is_common_jisho,
    queue.jlpt_level,
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
        where j.kana_reading = queue.kana_reading
          and (j.word = queue.word or (j.word is null and queue.word = queue.kana_reading))
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
          where j2.kana_reading = queue.kana_reading or j2.word = queue.word
          order by j2.id
          limit 8
        ) j2
      ),
      '[]'::jsonb
    ) as candidates,
    queue.resolution
  from queue
  order by queue.kana_reading;
$$;

revoke execute on function public.get_vocabulary_match_review_queue() from public, anon;
grant execute on function public.get_vocabulary_match_review_queue() to authenticated;

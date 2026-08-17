-- checkVocabMeaningAnswer (lib/study/kanjiMeaningMatch.ts) computes this row's
-- own accepted meanings straight from vocabulary.meanings, and crashes if that's
-- empty while all_word_meanings (aggregated from sibling rows sharing the same
-- word + kana_reading) isn't -- see the code review finding from this session.
-- Nothing in the app writes to public.vocabulary (it's a read-only reference
-- table seeded externally; see lib/data/vocabulary.ts), so enforcing "every
-- row has at least one meaning" here removes the crash precondition entirely
-- instead of working around it in application code.

ALTER TABLE public.vocabulary
  ADD CONSTRAINT vocabulary_meanings_not_empty_check
  CHECK (meanings IS NOT NULL AND cardinality(meanings) > 0);

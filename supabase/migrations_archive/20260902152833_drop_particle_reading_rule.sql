-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Reverts 20260912_particle_reading_rule.sql, per user request: instead of teaching は/を/へ
-- particle readings as a browse-page / study-queue rule card, the /study/test page now shows
-- the wa/o/e reading directly as furigana above the relevant characters in the test text itself
-- (see 20260914_reading_test_particle_hints.sql). Removes exactly the 5 rows that migration
-- added -- 4 in hiragana, 1 in kana_rule_labels -- nothing else. Matches this repo's existing
-- precedent for undoing a prior insert (20260829_drop_hiragana_particle_and_historical.sql):
-- a new migration, not an edit to the original one.

delete from public.hiragana where kana_type = 'particle_reading';
delete from public.kana_rule_labels where kana_type = 'particle_reading';

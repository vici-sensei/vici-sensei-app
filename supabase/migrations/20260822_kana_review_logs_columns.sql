-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- review_logs identifies which kanji/word a review was about via kanji_id/word_id,
-- but neither applies to hiragana_reading/katakana_reading -- without their own
-- reference columns, undoReview (lib/data/reviews.ts) would have no way to recover
-- which character a kana review row was for, breaking Undo for the kana track.

alter table public.review_logs
  add column hiragana_id bigint null references public.hiragana(id) on delete cascade,
  add column katakana_id bigint null references public.katakana(id) on delete cascade;

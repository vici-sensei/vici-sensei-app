-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Generalizes reading_test_sentences to hold more than one test (hiragana today, katakana/N5
-- later per user request) -- adds test_type and switches sort_order's uniqueness to be scoped
-- per test_type instead of global, so a future test's own sentence #1 doesn't collide with this
-- one's sort_order = 1.

alter table public.reading_test_sentences add column test_type text not null default 'hiragana';
alter table public.reading_test_sentences add constraint reading_test_sentences_test_type_check
  check (test_type = 'hiragana');

alter table public.reading_test_sentences drop constraint reading_test_sentences_sort_order_key;
alter table public.reading_test_sentences add constraint reading_test_sentences_test_type_sort_order_key
  unique (test_type, sort_order);

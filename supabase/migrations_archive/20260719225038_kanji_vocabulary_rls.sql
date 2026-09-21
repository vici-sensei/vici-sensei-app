-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- kanji, vocabulary, and kanji_word had no RLS at all, unlike every other
-- table in the schema. The app now requires a logged-in session to read
-- them (see app/api/kanji, app/api/vocabulary), but that's an app-layer
-- check only -- anyone querying Supabase directly with the anon key could
-- still read this data. No app code ever inserts/updates/deletes these
-- tables (they're seeded reference data), so the policies only grant
-- SELECT to authenticated users; write access stays denied for everyone
-- except the service-role client, which bypasses RLS entirely.
--
-- search_kanji, search_vocabulary, get_new_kanji_candidates,
-- get_new_vocab_candidates, and get_due_cards all query these tables and
-- run as SECURITY INVOKER (the default -- none of them declare SECURITY
-- DEFINER), so these policies apply to them too. Every caller of those
-- functions/tables in app/api already sits behind requireUser(), so this
-- should not change behavior for logged-in users.

alter table public.kanji enable row level security;
alter table public.vocabulary enable row level security;
alter table public.kanji_word enable row level security;

create policy "Authenticated users can read kanji" on public.kanji
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read vocabulary" on public.vocabulary
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read kanji_word" on public.kanji_word
  for select
  to authenticated
  using (true);

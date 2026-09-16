-- Strips stray whitespace out of public.test.question. 4 hiragana onomatopoeia rows (ids 39, 54,
-- 57, 58 -- the reduplicated forms like "hyuu hyuu") had a full-width space (U+3000) between the
-- repeated halves, e.g. "ひゅう　ひゅう", unlike every other question in the table, which has no
-- internal whitespace at all. romaji keeps its own (regular) space -- checkKanaReadingAnswer
-- already strips whitespace from both sides before comparing (lib/study/kanaReadingMatch.ts), so
-- this doesn't touch how those rows are graded.
update public.test
set question = regexp_replace(question, '\s+', '', 'g')
where question ~ '\s';

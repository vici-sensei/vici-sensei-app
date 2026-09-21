-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fills public.vocabulary.primary_meanings/other_meanings for 2 of the remaining NULL rows by
-- copying straight from the jmdict_entries row whose meanings match:
--
--   vocabulary.id  word    jmdict_entries.id  word/kana_reading
--   9927   七十/ななじゅう  -> 54401   ７０/しちじゅう ("seventy", "70")
--   13422  コンマ           -> 42694   読点/とうてん   ("comma")
--
-- Deliberately NOT linked via jmdict_entries.vocabulary_ids like the 9 words in
-- 20261201_link_spelling_variant_vocabulary_to_jmdict.sql -- those 9 were verified spelling
-- variants of the exact same word. These 2 jmdict_entries rows are a genuinely different Japanese
-- word/reading (読点 is a native synonym for "comma", しちじゅう an alternate reading of 70, not a
-- typo of ななじゅう) -- vocabulary_ids asserts "this jmdict_entries row corresponds to this exact
-- vocabulary word", which would be lexically wrong here. Only the display columns get the copy.
--
-- Neither jmdict_entries row had ever been linked to anything before, so -- same root cause as 7
-- of the 9 in 20261201 -- their own primary_meanings/other_meanings were never computed from
-- senses (still at the column default). Re-fires sync_jmdict_entries_primary_other_meanings() for
-- just these two first.
update public.jmdict_entries
set senses = senses
where id in (54401, 42694);

with links(vocab_id, entry_id) as (
  values (9927, 54401), (13422, 42694)
)
update public.vocabulary v
set primary_meanings = e.primary_meanings, other_meanings = e.other_meanings
from links l
join public.jmdict_entries e on e.id = l.entry_id
where v.id = l.vocab_id;

-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Reverses the uniqueness invariant added in 20261121_jmdict_entries_vocabulary_ids_array.sql.
-- That migration kept the old "a vocabulary row corresponds to at most one jmdict_entries row"
-- rule alive via a trigger, even after vocabulary_id became the array vocabulary_ids. Turns out
-- there's now a concrete need to break it: some vocabulary words (e.g. id 2827, スイッチ) have two
-- real JMdict senses under the same reading (switch (electrical) vs (Nintendo) Switch) and both
-- should be linkable to that one vocabulary row across its two separate jmdict_entries rows --
-- which the trigger was rejecting.
--
-- Dropping this trigger has no data-preservation concerns since it errors out and blocks writes
-- rather than shaping stored data -- there's nothing to migrate, only a rule to remove.

drop trigger trg_jmdict_vocabulary_ids_unique on public.jmdict_entries;
drop function public.check_jmdict_vocabulary_ids_unique();

comment on column public.jmdict_entries.vocabulary_ids is 'public.vocabulary.id values this JMdict entry corresponds to. No FK -- arrays can''t reference a scalar PK. A vocabulary id may now appear in more than one jmdict_entries row (e.g. one vocabulary word covering two distinct JMdict senses under the same reading) -- see 20261122_jmdict_entries_allow_shared_vocabulary_ids.sql.';

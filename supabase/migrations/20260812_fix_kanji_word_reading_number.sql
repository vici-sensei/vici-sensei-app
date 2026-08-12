-- Run this manually in the Supabase SQL editor.
--
-- public.kanji_word.reading_number holds incorrect values; reading_number_copy
-- holds the correct ones. Overwrite reading_number with reading_number_copy,
-- then drop reading_number_copy. reading_group is untouched.

update public.kanji_word
set reading_number = reading_number_copy;

alter table public.kanji_word drop column reading_number_copy;

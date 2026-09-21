-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a bug surfaced live right after 20261219_vocabulary_primary_meanings_include_short_meaning.sql
-- shipped: 三日 (id 576) displayed ", 3rd day of the month" in the /study new-kanji word list --
-- a leading empty element from short_meaning being '' rather than null. 36/436 short_meaning rows
-- are '' (leftover from the retired /admin/short-meanings page saving an empty field as '' instead
-- of null -- see 20261213_vocabulary_short_meaning_column.sql, whose column comment already says
-- "NULL until curated", not ''). vocabulary_primary_meanings only guarded against null, so it
-- prepended these blanks as a real array element.
--
-- 1. Data cleanup: normalize the 36 existing '' rows to null, matching the column's own contract.
-- 2. Defense in depth: vocabulary_primary_meanings now uses nullif(trim(...), '') so a future blank
--    (whitespace or empty) can't reintroduce this even though the admin write path is retired.

update public.vocabulary
set short_meaning = null
where short_meaning is not null
  and trim(short_meaning) = '';

create or replace function public.vocabulary_primary_meanings(v public.vocabulary)
returns text[]
language sql
immutable
as $function$
  select case
    when nullif(trim(v.short_meaning), '') is not null then array[nullif(trim(v.short_meaning), '')] || v.primary_meanings
    else v.primary_meanings
  end;
$function$;

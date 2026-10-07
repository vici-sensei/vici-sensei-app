-- EU-new ONLY. Part 3 of 4 of the admin-editable kanji words (see 20261007064452_kanji_words_admin_rpcs.sql):
-- tells the push which foreign schema reaches the other region (US-new, mirror_us_fdw, server us_mirror_server)
-- and imports the four tables the push writes as foreign tables.
--
-- Apply ONLY after parts 1 and 2 are applied on BOTH regions: IMPORT FOREIGN SCHEMA reads the remote tables'
-- definitions, so they must already exist on US-new. The user mapping and the server already exist (the admin
-- mirror uses them); nothing secret is needed here.
--
-- batch_size lets a bulk operation copy hundreds of kanji in a few round trips instead of one per row.

create or replace function public.kw_remote_schema()
returns text
language sql
immutable
as $function$ select 'mirror_us_fdw'::text $function$;

revoke all on function public.kw_remote_schema() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['kanji_detail_words', 'kanji_word_overrides', 'kanji_word_review', 'kanji_word_history']
  loop
    if to_regclass(format('mirror_us_fdw.%I', t)) is null then
      execute format('import foreign schema public limit to (%I) from server us_mirror_server into mirror_us_fdw', t);
      execute format('alter foreign table mirror_us_fdw.%I options (add batch_size ''500'')', t);
      execute format('revoke all on table mirror_us_fdw.%I from public, anon, authenticated', t);
    end if;
  end loop;
end;
$$;

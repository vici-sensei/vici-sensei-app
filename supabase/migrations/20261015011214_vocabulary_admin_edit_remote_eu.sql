-- EU-new ONLY. Part 2 of 3 of editing a word's dictionary data (see 20261015011213_vocabulary_admin_edit.sql):
-- imports the two tables admin_update_vocabulary writes on the other region (US-new) as foreign tables, into the
-- schema kw_remote_schema() already names here (mirror_us_fdw, server us_mirror_server).
--
-- Apply ONLY after part 1 is applied on BOTH regions: IMPORT FOREIGN SCHEMA reads the remote tables' definitions,
-- so vocabulary_edits must already exist on US-new. The user mapping and the server already exist (the admin mirror
-- and the kanji-words push use them); nothing secret is needed here.

do $$
declare
  t text;
begin
  foreach t in array array['vocabulary', 'vocabulary_edits']
  loop
    if to_regclass(format('mirror_us_fdw.%I', t)) is null then
      execute format('import foreign schema public limit to (%I) from server us_mirror_server into mirror_us_fdw', t);
      -- IMPORT ... LIMIT TO silently skips a table the other side doesn't have.
      if to_regclass(format('mirror_us_fdw.%I', t)) is null then
        raise exception 'public.% is missing on US-new: apply 20261015011213_vocabulary_admin_edit.sql there first', t;
      end if;
      execute format('revoke all on table mirror_us_fdw.%I from public, anon, authenticated', t);
    end if;
  end loop;
end;
$$;

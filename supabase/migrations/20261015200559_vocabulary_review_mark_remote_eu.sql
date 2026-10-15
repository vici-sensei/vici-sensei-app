-- EU-new ONLY. Part 2 of 3 of the "reviewed" mark on a word (see 20261015200558_vocabulary_review_mark.sql): imports
-- the table admin_set_vocabulary_reviewed writes on the other region (US-new) as a foreign table, into the schema
-- kw_remote_schema() already names here (mirror_us_fdw, server us_mirror_server).
--
-- Apply ONLY after part 1 is applied on BOTH regions: IMPORT FOREIGN SCHEMA reads the remote table's definition, so
-- vocabulary_review must already exist on US-new. The user mapping and the server already exist (the admin mirror
-- and the kanji-words push use them); nothing secret is needed here.

do $$
begin
  if to_regclass('mirror_us_fdw.vocabulary_review') is null then
    import foreign schema public limit to (vocabulary_review) from server us_mirror_server into mirror_us_fdw;
    -- IMPORT ... LIMIT TO silently skips a table the other side doesn't have.
    if to_regclass('mirror_us_fdw.vocabulary_review') is null then
      raise exception 'public.vocabulary_review is missing on US-new: apply 20261015200558_vocabulary_review_mark.sql there first';
    end if;
    revoke all on table mirror_us_fdw.vocabulary_review from public, anon, authenticated;
  end if;
end;
$$;

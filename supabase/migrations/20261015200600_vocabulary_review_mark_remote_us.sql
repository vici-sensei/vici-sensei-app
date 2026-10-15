-- US-new ONLY. Part 3 of 3 of the "reviewed" mark on a word (see 20261015200558_vocabulary_review_mark.sql): imports
-- the table admin_set_vocabulary_reviewed writes on the other region (EU-new) as a foreign table, into the schema
-- kw_remote_schema() already names here (mirror_eu_fdw, server eu_mirror_server).
--
-- Apply ONLY after part 1 is applied on BOTH regions: IMPORT FOREIGN SCHEMA reads the remote table's definition, so
-- vocabulary_review must already exist on EU-new. The user mapping and the server already exist (the admin mirror
-- and the kanji-words push use them); nothing secret is needed here. Mirror image of part 2.

do $$
begin
  if to_regclass('mirror_eu_fdw.vocabulary_review') is null then
    import foreign schema public limit to (vocabulary_review) from server eu_mirror_server into mirror_eu_fdw;
    -- IMPORT ... LIMIT TO silently skips a table the other side doesn't have.
    if to_regclass('mirror_eu_fdw.vocabulary_review') is null then
      raise exception 'public.vocabulary_review is missing on EU-new: apply 20261015200558_vocabulary_review_mark.sql there first';
    end if;
    revoke all on table mirror_eu_fdw.vocabulary_review from public, anon, authenticated;
  end if;
end;
$$;

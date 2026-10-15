-- EU-new ONLY. Part 2 of 3 of the faster region parity check (see 20261015160558_kanji_words_parity_stats_view.sql):
-- imports US-new's one-row kanji_words_parity_stats view as a foreign table, into the schema kw_remote_schema()
-- already names here (mirror_us_fdw, server us_mirror_server).
--
-- Apply ONLY after part 1 is applied on BOTH regions: IMPORT FOREIGN SCHEMA reads the remote view's definition, so it
-- must already exist on US-new. The user mapping and the server already exist; nothing secret is needed here.

do $$
begin
  if to_regclass('mirror_us_fdw.kanji_words_parity_stats') is null then
    import foreign schema public limit to (kanji_words_parity_stats) from server us_mirror_server into mirror_us_fdw;
    -- IMPORT ... LIMIT TO silently skips a table the other side doesn't have.
    if to_regclass('mirror_us_fdw.kanji_words_parity_stats') is null then
      raise exception 'public.kanji_words_parity_stats is missing on US-new: apply 20261015160558_kanji_words_parity_stats_view.sql there first';
    end if;
    revoke all on table mirror_us_fdw.kanji_words_parity_stats from public, anon, authenticated;
  end if;
end;
$$;

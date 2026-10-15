-- Both live projects (EU-new + US-new), identical text. Part 1 of 3 of a faster region parity check for
-- /admin/kanji-words (admin_kanji_words_parity()); parts 2 / 3 import the view from the other region.
--
-- Why: kw_stats(<foreign schema>) ran seven separate remote queries (~0.3 s each, EU <-> US), and the two hashes
-- were not pushed down at all (bigint || text calls the STABLE anytextcat, which postgres_fdw never ships), so all
-- 5189 rows of kanji_detail_words crossed the ocean 100 at a time (~5 s). Total ~8.2 s: the PostgREST role's 8 s
-- statement timeout made the call fail about half the time, and the page swallowed it.
--
-- Now each region computes its own one-row summary (same formulas, same values as before) and the other side reads
-- that row through one foreign table: a single remote query, nothing shipped but the result.
--
-- Until part 2 / 3 is applied on a region, kw_stats(<foreign schema>) fails there (no foreign table yet); the page
-- ignores a failed parity check, as it did with the timeouts.

create or replace view public.kanji_words_parity_stats
with (security_invoker = true)
as
select
  (select count(*) from public.kanji_detail_words) as final_rows,
  (select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || rank, ',' order by kanji_id, kanji_word_id))
     from public.kanji_detail_words) as final_hash,
  (select count(*) from public.kanji_word_overrides) as overrides,
  (select md5(string_agg(kanji_id || ':' || kanji_word_id || ':' || op, ',' order by kanji_id, kanji_word_id))
     from public.kanji_word_overrides) as overrides_hash,
  (select coalesce(sum(version), 0) from public.kanji_word_review) as version_sum,
  (select count(*) from public.kanji_word_review where reviewed) as reviewed,
  (select count(*) from public.kanji_word_history) as history_rows;

revoke all on table public.kanji_words_parity_stats from public, anon, authenticated;

-- ---------- Stats of one side, for the parity check ----------

create or replace function public.kw_stats(p_schema text)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  execute format('select to_jsonb(t) from %I.kanji_words_parity_stats t', p_schema) into v;
  return v;
end;
$function$;

revoke all on function public.kw_stats(text) from public, anon, authenticated;

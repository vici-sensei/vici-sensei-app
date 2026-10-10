-- Scope: both live projects (EU-new + US-new), identical text. vocabulary is reference data,
-- byte-identical on both; the frozen project (hmbemylaqnkiamvhcdcd) does not get it.
--
-- 言葉 (ことば): "word" moves to the first place in primary_meanings, before "language" and "dialect"
-- (20261010170918_kotoba_primary_meaning_word put it last). other_meanings is not touched.
--
-- Idempotent and guarded: the row must exist exactly once and hold either the old or the new order,
-- anything else aborts the whole migration.

do $$
declare
  v_old_primary text[] := array['language', 'dialect', 'word'];
  v_new_primary text[] := array['word', 'language', 'dialect'];
  v_count integer;
begin
  select count(*) into v_count from public.vocabulary where word = '言葉' and kana_reading = 'ことば';
  if v_count <> 1 then
    raise exception '言葉/ことば: expected exactly 1 row, found %', v_count;
  end if;

  if not exists (
    select 1 from public.vocabulary
    where word = '言葉' and kana_reading = 'ことば'
      and primary_meanings in (v_old_primary, v_new_primary)) then
    raise exception '言葉/ことば differs from what this migration was written against';
  end if;

  update public.vocabulary
  set primary_meanings = v_new_primary
  where word = '言葉' and kana_reading = 'ことば'
    and primary_meanings is distinct from v_new_primary;

  if not exists (
    select 1 from public.vocabulary
    where word = '言葉' and kana_reading = 'ことば'
      and primary_meanings = v_new_primary) then
    raise exception '言葉/ことば not updated';
  end if;
end $$;

-- Scope: both live projects (EU-new + US-new), identical text. vocabulary is reference data,
-- byte-identical on both; the frozen project (hmbemylaqnkiamvhcdcd) does not get it.
--
-- 言葉 (ことば): "word" becomes a primary meaning next to "language" and "dialect", and leaves
-- other_meanings (it was the first entry of the first sense group: word / phrase / expression / term).
-- "words" in the third group stays. Meanings are read live (get_due_cards / get_vocab_meaning_pool),
-- no per-user data holds a copy.
--
-- Idempotent and guarded: the row must exist exactly once and hold either the old or the new value
-- in both columns, anything else aborts the whole migration.

do $$
declare
  v_old_primary text[] := array['language', 'dialect'];
  v_new_primary text[] := array['language', 'dialect', 'word'];
  v_old_other jsonb := '[["word", "phrase", "expression", "term"], ["speech", "(manner of) speaking", "(use of) language"], ["words", "remark", "statement", "comment"], ["learning to speak", "language acquisition"]]';
  v_new_other jsonb := '[["phrase", "expression", "term"], ["speech", "(manner of) speaking", "(use of) language"], ["words", "remark", "statement", "comment"], ["learning to speak", "language acquisition"]]';
  v_count integer;
begin
  select count(*) into v_count from public.vocabulary where word = '言葉' and kana_reading = 'ことば';
  if v_count <> 1 then
    raise exception '言葉/ことば: expected exactly 1 row, found %', v_count;
  end if;

  if not exists (
    select 1 from public.vocabulary
    where word = '言葉' and kana_reading = 'ことば'
      and primary_meanings in (v_old_primary, v_new_primary)
      and other_meanings in (v_old_other, v_new_other)) then
    raise exception '言葉/ことば differs from what this migration was written against';
  end if;

  update public.vocabulary
  set primary_meanings = v_new_primary,
      other_meanings = v_new_other
  where word = '言葉' and kana_reading = 'ことば'
    and (primary_meanings is distinct from v_new_primary or other_meanings is distinct from v_new_other);

  if not exists (
    select 1 from public.vocabulary
    where word = '言葉' and kana_reading = 'ことば'
      and primary_meanings = v_new_primary
      and other_meanings = v_new_other) then
    raise exception '言葉/ことば not updated';
  end if;
end $$;

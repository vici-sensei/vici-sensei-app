-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Renames reading_test_sentences -> test and its hiragana column -> question, per user request
-- ahead of adding the katakana reading test: the table already spans more than hiragana content
-- (test_type-scoped since 20260915_reading_test_type_column.sql, katakana rows added right after
-- this migration), so "reading_test_sentences" read oddly once test_type diversified, and
-- "hiragana" was flatly wrong on a katakana row. Also widens the test_type check constraint
-- (previously hiragana-only) to allow 'katakana', and renames the check/unique constraint and RLS
-- policy to match the new table name -- cosmetic, but cheap while already touching them.
--
-- reading_test_passed and reading_test_progress_updates_badge both reference this table by name in
-- their SQL body text (not by OID), so both are recreated here pointing at public.test -- otherwise
-- they'd fail to resolve "reading_test_sentences" on their next call post-rename. CREATE OR REPLACE
-- preserves each function's OID/triggers/grants; only the body text changes. Neither function reads
-- the hiragana/question column, so the column rename doesn't touch them.

alter table public.reading_test_sentences rename to test;
alter table public.test rename column hiragana to question;

alter table public.test rename constraint reading_test_sentences_pkey to test_pkey;
alter table public.test rename constraint reading_test_sentences_test_type_sort_order_key to test_test_type_sort_order_key;

alter table public.test drop constraint reading_test_sentences_test_type_check;
alter table public.test add constraint test_test_type_check check (test_type in ('hiragana', 'katakana'));

alter policy "Authenticated users can read reading_test_sentences" on public.test
  rename to "Authenticated users can read test";

create or replace function public.reading_test_passed(p_user_id uuid, p_test_type text)
returns boolean
language sql
stable
as $function$
  select
    (select count(*) from public.test where test_type = p_test_type) > 0
    and (select count(*) from public.test where test_type = p_test_type)
        <= (select count(*) from public.user_reading_test_progress
            where user_id = p_user_id and test_type = p_test_type and correct);
$function$;

create or replace function public.reading_test_progress_updates_badge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
  v_answered int;
  v_correct int;
begin
  select count(*) into v_total from public.test where test_type = new.test_type;
  select count(*), count(*) filter (where correct) into v_answered, v_correct
    from public.user_reading_test_progress
    where user_id = new.user_id and test_type = new.test_type;

  if v_total = 0 or v_answered < v_total then
    return new;
  end if;

  insert into public.user_badges (user_id, badge_key, test_type, attempt_number, percent, earned_at, updated_at)
  values (
    new.user_id,
    'reading_test_' || new.test_type,
    new.test_type,
    public.reading_test_current_attempt(new.user_id, new.test_type),
    round(v_correct * 100.0 / v_total)::int,
    now(),
    now()
  )
  on conflict (user_id, badge_key) do update
  set test_type = excluded.test_type,
      attempt_number = excluded.attempt_number,
      percent = excluded.percent,
      updated_at = now();

  return new;
end;
$function$;

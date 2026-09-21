-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Keeps user_study_settings.new_vocab_per_day in sync with
-- new_kanji_per_day at a fixed 6:1 ratio, in both directions:
--   - Changing new_kanji_per_day recomputes new_vocab_per_day = new_kanji_per_day * 6.
--   - Changing new_vocab_per_day recomputes new_kanji_per_day = round(new_vocab_per_day / 6).
--   - On INSERT, new_kanji_per_day is authoritative (matches the existing
--     table defaults of 2 / 12, which already satisfy the ratio).
--   - If a single UPDATE changes both columns at once, new_kanji_per_day wins
--     and new_vocab_per_day is recomputed from it.

create or replace function public.sync_new_vocab_per_day()
 returns trigger
 language plpgsql
as $function$
begin
  if TG_OP = 'INSERT' then
    new.new_vocab_per_day := new.new_kanji_per_day * 6;
  elsif TG_OP = 'UPDATE' then
    if new.new_kanji_per_day is distinct from old.new_kanji_per_day then
      new.new_vocab_per_day := new.new_kanji_per_day * 6;
    elsif new.new_vocab_per_day is distinct from old.new_vocab_per_day then
      new.new_kanji_per_day := round(new.new_vocab_per_day::numeric / 6)::int4;
    end if;
  end if;
  return new;
end;
$function$
;

drop trigger if exists sync_new_vocab_per_day_trigger on public.user_study_settings;

create trigger sync_new_vocab_per_day_trigger
  before insert or update on public.user_study_settings
  for each row
  execute function public.sync_new_vocab_per_day();

-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Post-introduction drill for hiragana_reading/katakana_reading: right after a "New
-- Hiragana"/"New Katakana" gojuon pack is introduced (20260826_pair_new_kana_with_reading_pack.sql
-- hands its reading pack over immediately), the user now repeats that pack's reading cards --
-- shuffled, one at a time -- until every character has been answered correctly 3 times IN A
-- ROW. Any wrong answer resets that character's own streak back to 0; the other characters'
-- streaks are unaffected. There are no Hard/Good/Easy buttons during this phase -- grading is
-- purely correct/incorrect from the typed answer, same as the existing "wrong answer" Continue
-- flow already uses (rating 0). This whole drill is deliberately separate from the normal SRS
-- schedule: no review_logs rows, no ease_factor/interval changes, until a character actually
-- graduates.
--
-- drill_streak persists progress per character in the database (not just in browser memory)
-- specifically so a page refresh mid-drill resumes exactly where it left off, instead of losing
-- the streak and restarting that character from zero.
--
-- Graduating (streak reaches 3) moves the row straight to status='review', due_at = now() + 1
-- day, interval_days = 1 -- the same GRADUATING_INTERVAL_DAYS a normal learning-phase card gets
-- on a passing rating (see compute_review_result in 20260820_submit_review_rpc.sql) -- so the
-- character's first *real* spaced-repetition review happens tomorrow, then evolves through the
-- normal SM-2 schedule exactly like every other review from there on. ease_factor is left
-- untouched at whatever it already was (2.5, the column default -- introduce_hiragana/
-- introduce_katakana never change it) since the drill doesn't grade difficulty, only correctness.
--
-- record_hiragana_drill_result/record_katakana_drill_result raise if the row isn't currently
-- status='learning' -- once graduated, a character must go through submit_review like any other
-- review, not this RPC again.

alter table public.user_hiragana_progress
  add column if not exists drill_streak int4 not null default 0;

alter table public.user_katakana_progress
  add column if not exists drill_streak int4 not null default 0;

create or replace function public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean)
returns table(drill_streak integer, graduated boolean)
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
begin
  select * into v_current from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id;

  if v_current is null then
    raise exception 'No progress found for this hiragana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This hiragana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_hiragana_progress set drill_streak = 0, updated_at = now()
      where id = v_current.id;
    return query select 0, false;
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    update public.user_hiragana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = now() + interval '1 day',
      last_reviewed_at = now(), updated_at = now()
    where id = v_current.id;
    return query select v_streak, true;
    return;
  end if;

  update public.user_hiragana_progress set drill_streak = v_streak, updated_at = now()
    where id = v_current.id;
  return query select v_streak, false;
end;
$function$;

create or replace function public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean)
returns table(drill_streak integer, graduated boolean)
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
begin
  select * into v_current from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id;

  if v_current is null then
    raise exception 'No progress found for this katakana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This katakana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_katakana_progress set drill_streak = 0, updated_at = now()
      where id = v_current.id;
    return query select 0, false;
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    update public.user_katakana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = now() + interval '1 day',
      last_reviewed_at = now(), updated_at = now()
    where id = v_current.id;
    return query select v_streak, true;
    return;
  end if;

  update public.user_katakana_progress set drill_streak = v_streak, updated_at = now()
    where id = v_current.id;
  return query select v_streak, false;
end;
$function$;

grant execute on function public.record_hiragana_drill_result(uuid, bigint, boolean) to authenticated;
grant execute on function public.record_katakana_drill_result(uuid, bigint, boolean) to authenticated;

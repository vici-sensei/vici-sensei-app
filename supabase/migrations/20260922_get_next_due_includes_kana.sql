-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Bug: get_next_due only ever unioned user_kanji_meaning_progress/user_kanji_reading_progress/
-- user_vocabulary_progress -- for a kana-track user (study_kanji/study_vocabulary both false, so
-- all three tables are empty for them) it always returned next_due_at = null, regardless of what
-- was actually coming due in user_hiragana_progress/user_katakana_progress. This silently broke
-- two things built on top of it for every kana-track user: QueueProgressBar's "next card in..."
-- countdown, and (just added) useStudyQueue.ts's guard against ending a session the instant the
-- queue empties -- answering the last card wrong resets it to 'learning' with a due_at moments
-- away (an ordinary same-session learning-step retry), but with next_due_at always null there was
-- no way to tell that apart from "genuinely nothing left today", so the session always ended
-- immediately and routed to /study/summary before the retry ever got a chance to resurface.
--
-- Fix: union in user_hiragana_progress/user_katakana_progress too, gated by study_track/
-- study_hiragana/study_katakana and pack_pending the same way get_due_cards already gates its own
-- hiragana_reading/katakana_reading branches -- so a graduated standard-track account's old,
-- long-mastered kana rows (never deleted when study_track flips) can't leak in as a false
-- next-due signal, and a still-pending pack member can't either.

create or replace function public.get_next_due(p_user_id uuid, p_timezone text default 'UTC')
returns table(next_due_at timestamptz, next_due_is_today boolean, next_due_status text)
language plpgsql
stable
as $function$
declare
  v_next_due_at timestamptz;
  v_next_due_status text;
  v_day_end timestamptz;
begin
  select day_end into v_day_end from public.study_day_bounds(p_timezone);

  select due_at, status into v_next_due_at, v_next_due_status
  from (
    select due_at, status from public.user_kanji_meaning_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_kanji_reading_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_vocabulary_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select p.due_at, p.status
    from public.user_hiragana_progress p
    join public.user_study_settings s on s.user_id = p.user_id
    where p.user_id = p_user_id
      and p.due_at > now()
      and p.status != 'suspended'
      and not p.pack_pending
      and s.study_track = 'kana'
      and s.study_hiragana
    union all
    select p.due_at, p.status
    from public.user_katakana_progress p
    join public.user_study_settings s on s.user_id = p.user_id
    where p.user_id = p_user_id
      and p.due_at > now()
      and p.status != 'suspended'
      and not p.pack_pending
      and s.study_track = 'kana'
      and s.study_katakana
  ) t
  order by due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$function$;

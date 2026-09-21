-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Backfill graduated_at for kana that graduated through the drill (20261235_kana_graduated_at_
-- and_student_daily_activity.sql) before that column existed, scoped to rows where the graduation
-- date is still recoverable: exactly one real review since graduating (repetitions = 1,
-- interval_days = 1, status = 'review', kana_type = 'seion') means last_reviewed_at still holds
-- the graduation moment -- it hasn't been overwritten by a second real review yet. Same target
-- set/reasoning as the due_at backfill in 20261016_kana_drill_due_at_study_day.sql. Anything with
-- repetitions > 1 already lost its exact graduation date (last_reviewed_at was overwritten by a
-- later review) and is left null permanently -- there's nothing left to recover for those.
--
-- (This file originally also (re)created get_admin_student_roster -- superseded by the version in
-- 20261237_test_count_on_leaderboard_stats.sql, which already shipped and reads test_count from
-- leaderboard_stats directly. Running that older copy now would regress the roster's Test column
-- back to counting test_status attempts, so it's been dropped from here.)
update public.user_hiragana_progress p
set graduated_at = p.last_reviewed_at
where p.graduated_at is null
  and p.status = 'review'
  and p.repetitions = 1
  and p.interval_days = 1
  and p.last_reviewed_at is not null
  and exists (select 1 from public.hiragana h where h.id = p.hiragana_id and h.kana_type = 'seion');

update public.user_katakana_progress p
set graduated_at = p.last_reviewed_at
where p.graduated_at is null
  and p.status = 'review'
  and p.repetitions = 1
  and p.interval_days = 1
  and p.last_reviewed_at is not null
  and exists (select 1 from public.katakana k where k.id = p.katakana_id and k.kana_type = 'seion');

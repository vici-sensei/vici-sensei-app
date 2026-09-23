-- EU only (mirror image: 20260923044601_admin_leads_mirror_and_student_region_us.sql). Two
-- independent admin-panel additions on top of Phase 6's mirror_us/admin_all:
--
-- (1) free_lesson_leads joins the cross-region mirror. It was deliberately left out of Phase 6
--     ("leads aren't region-split" -- true of the marketing site's capture today, but irrelevant:
--     an admin logged into EU simply cannot see a lead that landed in US's own public.free_lesson_leads,
--     regardless of why it ended up there). Same shape as every other mirrored table: a
--     mirror_us_fdw foreign table (live read AND write -- see admin_update_lead_contacted below),
--     a mirror_us local snapshot refreshed by the existing 5-min cron, and an admin_all union view.
--     The uncommitted, connection-needing companion step for this file is
--     `IMPORT FOREIGN SCHEMA public LIMIT TO (free_lesson_leads) FROM SERVER us_mirror_server INTO mirror_us_fdw;`
--     -- run directly, same pattern as every other cross-project connection in this project
--     (20260923003744_fix_mirror_us_replication.sql's own comment).
--
-- (2) admin_get_student_detail now also returns which region a student's row actually lives in.
--     Previously undiscoverable even at the DB level: admin_all.users is a blind
--     `SELECT * FROM public.users UNION ALL SELECT * FROM mirror_us.users`, no origin tag. Inlines
--     that same union just for this function, tagged 'eu'/'us' at the source instead.

-- ---------- (1) Leads ----------

CREATE TABLE IF NOT EXISTS mirror_us.free_lesson_leads (LIKE public.free_lesson_leads INCLUDING DEFAULTS INCLUDING INDEXES);
ALTER TABLE mirror_us.free_lesson_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mirror_us.free_lesson_leads FROM anon, authenticated;

CREATE OR REPLACE VIEW admin_all.free_lesson_leads AS
  SELECT * FROM public.free_lesson_leads
  UNION ALL
  SELECT * FROM mirror_us.free_lesson_leads;

REVOKE ALL ON admin_all.free_lesson_leads FROM anon, authenticated;

-- Same body as 20260923003744_fix_mirror_us_replication.sql's version, plus free_lesson_leads.
CREATE OR REPLACE FUNCTION mirror_us.refresh_all() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'leaderboard_stats', 'leaderboard_daily_stats', 'user_study_settings',
    'review_logs', 'practice_logs', 'user_hiragana_progress', 'user_katakana_progress',
    'test_status', 'user_achievements', 'user_kanji_meaning_progress',
    'user_kanji_reading_progress', 'user_vocabulary_progress', 'user_hiragana_rule_progress',
    'user_katakana_rule_progress', 'user_reading_test_progress', 'free_lesson_leads'
  ]
  LOOP
    EXECUTE format('TRUNCATE mirror_us.%I', t);
    EXECUTE format('INSERT INTO mirror_us.%1$I SELECT * FROM mirror_us_fdw.%1$I', t);
  END LOOP;
END;
$$;

CREATE FUNCTION public.admin_get_free_lesson_leads()
RETURNS TABLE(id bigint, name text, whatsapp text, consent boolean, contacted boolean, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select l.id, l.name, l.whatsapp, l.consent, l.contacted, l.created_at
  from admin_all.free_lesson_leads l
  where public.is_admin()
  order by l.created_at desc;
$$;

REVOKE ALL ON FUNCTION public.admin_get_free_lesson_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_free_lesson_leads() TO authenticated;

-- mirror_us.* is a <=5min-stale snapshot (truncate+reinsert by the cron job) -- writing a toggle
-- there would just get clobbered by the next refresh. mirror_us_fdw.* has no such lag: a write
-- through a postgres_fdw foreign table goes straight to the live remote row.
CREATE FUNCTION public.admin_update_lead_contacted(p_lead_id bigint, p_contacted boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.free_lesson_leads SET contacted = p_contacted WHERE id = p_lead_id;
  IF NOT FOUND THEN
    UPDATE mirror_us_fdw.free_lesson_leads SET contacted = p_contacted WHERE id = p_lead_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_lead_contacted(bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lead_contacted(bigint, boolean) TO authenticated;

-- Same signature as before (20260923043228_admin_roster_exclude_pending_deletion.sql) -- only the
-- two lead counts change source, from public.free_lesson_leads to the new cross-region view.
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS TABLE(total_students bigint, new_students_7d bigint, active_today bigint, active_7d bigint, reviews_today bigint, new_leads_7d bigint, leads_uncontacted bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    case when not public.is_admin() then null else (select count(*) from admin_all.users
       where admin = false and pending_deletion_at is null) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.users
       where admin = false and pending_deletion_at is null and created_at >= now() - interval '7 days') end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and u.pending_deletion_at is null and ls.last_active_date = current_date) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and u.pending_deletion_at is null and ls.last_active_date >= current_date - 6) end,
    case when not public.is_admin() then null else (select coalesce(sum(lds.reviews_count), 0) from admin_all.leaderboard_daily_stats lds join admin_all.users u on u.id = lds.user_id
       where u.admin = false and u.pending_deletion_at is null and lds.day = current_date) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.free_lesson_leads where created_at >= now() - interval '7 days') end,
    case when not public.is_admin() then null else (select count(*) from admin_all.free_lesson_leads where contacted = false) end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;

-- ---------- (2) Student detail: region ----------

-- Return type is changing (a new trailing column), so CREATE OR REPLACE can't be used here --
-- Postgres requires the old signature dropped first.
DROP FUNCTION public.admin_get_student_detail(uuid);

CREATE FUNCTION public.admin_get_student_detail(p_user_id uuid)
RETURNS TABLE(
  id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean,
  created_at timestamp with time zone, pending_deletion_at timestamp with time zone,
  current_streak integer, longest_streak integer, last_active_date date, retention_rate numeric,
  study_track text, enabled_levels text[], new_kanji_per_day integer, new_vocab_per_day integer,
  new_hiragana_per_day integer, new_katakana_per_day integer, max_reviews_per_day integer,
  extended_romaji_enabled boolean, kana_practice_enabled boolean, timezone text,
  timezone_preference_enabled boolean, region text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    u.pending_deletion_at,
    streaks.current_streak, streaks.longest_streak, ls.last_active_date,
    public.admin_retention_rate(p_user_id, 30),
    s.study_track, s.enabled_levels, s.new_kanji_per_day, s.new_vocab_per_day,
    s.new_hiragana_per_day, s.new_katakana_per_day, s.max_reviews_per_day,
    s.extended_romaji_enabled, s.kana_practice_enabled, s.timezone, s.timezone_preference_enabled,
    u.region
  from (
    -- Explicit column list, not `SELECT *` -- mirror_us.users is a point-in-time `LIKE public.users`
    -- snapshot (20260922203458_admin_mirror_us_schema.sql) and never got `retired_to_region`, added
    -- to public.users afterward by 20260923012239_region_move_retirement.sql. admin_all.users's own
    -- `SELECT *` view survives only because it froze its column list back when both sides still
    -- matched; a fresh `SELECT *` union here does not, and errors "each UNION query must have the
    -- same number of columns". Only the 8 columns this function actually reads are needed anyway.
    select id, display_name, email, avatar_url, country, is_premium, created_at, pending_deletion_at, 'eu'::text as region from public.users
    union all
    select id, display_name, email, avatar_url, country, is_premium, created_at, pending_deletion_at, 'us'::text as region from mirror_us.users
  ) u
  left join admin_all.leaderboard_stats ls on ls.user_id = u.id
  left join admin_all.user_study_settings s on s.user_id = u.id
  cross join lateral public.admin_get_student_streaks(p_user_id) streaks
  where u.id = p_user_id and public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_detail(uuid) TO authenticated;

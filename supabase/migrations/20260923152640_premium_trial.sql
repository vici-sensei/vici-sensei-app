-- EU-new + US-new BOTH, identical text. Apply to BOTH projects before either of the
-- *_premium_trial_admin_{eu,us}.sql files: those add premium_until to the other region's
-- postgres_fdw foreign table, which errors on every 5-minute mirror refresh until the remote
-- public.users actually has the column.
--
-- Pro access gets an end date. premium_until NULL = no end date (as before); a non-null value is
-- when is_premium flips back to false, done by the pg_cron job below. It keeps its value after
-- expiry, so "trial ended on X" stays visible to the Teacher panel instead of looking like a
-- never-Pro account. is_premium stays the one boolean every reader (leaderboards, lb_export,
-- ProBadge) already uses -- none of them need to learn about dates.
--
-- New accounts start with a 7-day Pro trial (handle_new_user below). Existing accounts are left
-- as they are, per the product decision (admins set them by hand from /admin/students).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_until timestamp with time zone;

-- Not user-editable: authenticated only has column-level UPDATE on the four profile fields
-- (20260922222732_grant_users_self_edit_columns.sql), so this new column is server-controlled
-- without any extra REVOKE. Table-level SELECT already covers reading it on one's own row.

-- Same body as the baseline's, plus is_premium/premium_until on the users insert.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url, is_premium, premium_until)
  VALUES (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'full_name', 'User Nou'), 50),
    new.raw_user_meta_data->>'avatar_url',
    true,
    now() + interval '7 days'
  );

  INSERT INTO public.user_study_settings (user_id)
  VALUES (new.id);

  INSERT INTO public.leaderboard_stats (user_id)
  VALUES (new.id);

  RETURN new;
END;
$$;

-- A trial user who then pays: stripe-webhook's checkout.session.completed sets is_premium and a
-- (new) stripe_customer_id but knows nothing about premium_until, so without this the expiry job
-- would revoke a paying subscriber at the old trial end. Done here rather than in the Edge
-- Function so it holds whichever version of stripe-webhook is deployed on each project.
CREATE OR REPLACE FUNCTION public.clear_premium_until_on_stripe_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF new.is_premium AND new.stripe_customer_id IS NOT NULL
     AND new.stripe_customer_id IS DISTINCT FROM old.stripe_customer_id THEN
    new.premium_until := NULL;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_premium_until_on_stripe_customer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clear_premium_until_on_stripe_customer ON public.users;
CREATE TRIGGER clear_premium_until_on_stripe_customer
  BEFORE UPDATE OF stripe_customer_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.clear_premium_until_on_stripe_customer();

CREATE OR REPLACE FUNCTION public.expire_premium_trials() RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE public.users
  SET is_premium = false
  WHERE is_premium AND premium_until IS NOT NULL AND premium_until <= now();
$$;

REVOKE ALL ON FUNCTION public.expire_premium_trials() FROM PUBLIC, anon, authenticated;

-- Same 5-minute cadence as the mirror/lb_export refreshes; cron.schedule upserts by name.
SELECT cron.schedule('premium-trial-expiry', '*/5 * * * *', $$SELECT public.expire_premium_trials()$$);

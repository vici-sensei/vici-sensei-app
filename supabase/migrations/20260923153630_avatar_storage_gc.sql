-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text on both.
--
-- Avatar files must never outlive the account or the photo they belong to. Until now nothing ever
-- deleted a user's `avatars/<user_id>/` folder when the account went away (process-scheduled-deletions,
-- a Dashboard delete, and a region move's retired source all just remove auth.users), which is how
-- EU-new ended up with 68 of its 69 avatar files belonging to no user at all.
--
-- 1. on_user_deleted_remove_avatars: when a public.users row goes (the cascade from auth.users, so
--    every deletion path), queue a Storage API delete for everything in that user's folder.
-- 2. avatar_gc.collect(): the safety net for whatever the trigger or the app's own cleanup
--    (lib/client-data/userProfile.ts) missed -- a file in a folder with no user, or in a user's
--    folder but neither their current avatar_url nor its "_sm" thumbnail. Meant to run nightly as
--    the `avatar-gc` pg_cron job (operational setup at the bottom).
-- 3. The avatars bucket now enforces the type/size limits the app already assumes.
--
-- Deleting has to go through the Storage API: SQL `delete from storage.objects` is refused by
-- storage.protect_delete(), and would leave the actual file behind anyway. The calls go out via
-- pg_net with the vault's `service_role_key` (same secret the process-scheduled-account-deletions
-- cron job uses) and a vault `project_url` secret -- also in the operational setup below. pg_net
-- only sends a queued request once the calling transaction commits, and drops it on rollback, so a
-- rolled-back user deletion never deletes their files.

CREATE SCHEMA IF NOT EXISTS avatar_gc;

-- Storage paths ("<user_id>/<file>") that some user's avatar_url still points at, plus each one's
-- "_sm" thumbnail (naming rule: lib/avatar.ts). Matches the path on any host, so a URL still
-- pointing at another project keeps a same-named local file too -- errs on the side of keeping.
CREATE OR REPLACE FUNCTION avatar_gc.referenced_paths()
RETURNS SETOF text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p.path
  FROM public.users u
  CROSS JOIN LATERAL (SELECT substring(u.avatar_url FROM '/storage/v1/object/public/avatars/([^?#]+)') AS main) m
  CROSS JOIN LATERAL (VALUES (m.main), (regexp_replace(m.main, '(\.[A-Za-z0-9]+)$', '_sm\1'))) AS p(path)
  WHERE m.main IS NOT NULL;
$$;

-- Queues Storage API deletes for the given `avatars` object names, at most 1000 per request
-- (the API's own cap per call).
CREATE OR REPLACE FUNCTION avatar_gc.delete_objects(p_names text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_url text;
  v_count int := coalesce(array_length(p_names, 1), 0);
BEGIN
  IF v_count = 0 THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  SELECT rtrim(decrypted_secret, '/') INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  IF v_key IS NULL OR v_url IS NULL THEN
    RAISE EXCEPTION 'avatar_gc: vault secret service_role_key or project_url is missing';
  END IF;

  FOR i IN 1 .. v_count BY 1000 LOOP
    PERFORM net.http_delete(
      url := v_url || '/storage/v1/object/avatars',
      headers := jsonb_build_object(
        'apikey', v_key,
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('prefixes', to_jsonb(p_names[i : i + 999]))
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION avatar_gc.on_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM avatar_gc.delete_objects(ARRAY(
      SELECT o.name
      FROM storage.objects o
      WHERE o.bucket_id = 'avatars'
        AND split_part(o.name, '/', 1) = OLD.id::text
        AND NOT EXISTS (SELECT 1 FROM avatar_gc.referenced_paths() r WHERE r = o.name)
    ));
  EXCEPTION WHEN OTHERS THEN
    -- Never block an account deletion over a picture: whatever this misses, collect() still
    -- finds later, since the folder no longer matches any user.
    RAISE WARNING 'avatar_gc: could not queue avatar cleanup for deleted user %: %', OLD.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_user_deleted_remove_avatars ON public.users;
CREATE TRIGGER on_user_deleted_remove_avatars
  AFTER DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION avatar_gc.on_user_deleted();

-- Lists (p_dry_run, the default) or deletes every avatar file nothing refers to anymore. Files
-- younger than p_min_age are left alone, so an upload whose users row isn't updated yet (the app
-- writes the files first, see uploadAvatar) never counts as unreferenced.
CREATE OR REPLACE FUNCTION avatar_gc.collect(
  p_dry_run boolean DEFAULT true,
  p_min_age interval DEFAULT interval '1 day'
)
RETURNS TABLE (object_name text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_names text[];
  v_reasons text[];
BEGIN
  SELECT coalesce(array_agg(c.name ORDER BY c.name), '{}'), coalesce(array_agg(c.why ORDER BY c.name), '{}')
  INTO v_names, v_reasons
  FROM (
    SELECT o.name, CASE WHEN u.id IS NULL THEN 'no_user' ELSE 'not_current_avatar' END AS why
    FROM storage.objects o
    LEFT JOIN public.users u ON u.id::text = split_part(o.name, '/', 1)
    WHERE o.bucket_id = 'avatars'
      AND coalesce(o.updated_at, o.created_at) < now() - p_min_age
      AND NOT EXISTS (SELECT 1 FROM avatar_gc.referenced_paths() r WHERE r = o.name)
  ) c;

  IF NOT p_dry_run THEN
    PERFORM avatar_gc.delete_objects(v_names);
  END IF;

  RETURN QUERY SELECT * FROM unnest(v_names, v_reasons);
END;
$$;

-- Internal only: never reachable through PostgREST, same as lb_export.
REVOKE ALL ON SCHEMA avatar_gc FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA avatar_gc FROM PUBLIC, anon, authenticated;

-- The app re-encodes every photo to WebP/JPEG/PNG (AvatarCropModal) and caps it at 5MB
-- (userProfile.ts) -- enforce the same server-side, since RLS lets a user write their own folder
-- straight through the Storage API too.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
WHERE id = 'avatars';

-- ============ Operational setup, once per live project (EU-new and US-new) ============
-- Not part of the migration itself: the vault value is per project, and the first real sweep
-- permanently deletes whatever is already orphaned -- run that deliberately, after a dry run.
--
-- SELECT vault.create_secret('https://<project-ref>.supabase.co', 'project_url',
--   'Base URL of this project, for pg_net calls to its own APIs (avatar_gc)');
-- SELECT * FROM avatar_gc.collect();                            -- dry run: what would go, and why
-- SELECT count(*) FROM avatar_gc.collect(p_dry_run := false);   -- delete it
-- SELECT cron.schedule('avatar-gc', '30 3 * * *',
--   $$SELECT count(*) FROM avatar_gc.collect(p_dry_run := false)$$);
--
-- Each delete's HTTP result lands in net._http_response (kept ~6 hours) -- status_code 200 = done.

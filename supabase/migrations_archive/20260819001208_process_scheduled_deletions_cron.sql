-- MANUAL SETUP -- run once per environment in the Supabase SQL editor.
-- This can't be applied blindly like the other migrations: it needs your
-- project's real URL and a service-role key, neither of which belong in a
-- file committed to git.
--
-- One-time prerequisite, run first (replace the placeholder, then this
-- statement itself is the only part that should never be committed anywhere):
--   select vault.create_secret('<your-service-role-key>', 'service_role_key');
--
-- Then replace <PROJECT_REF> below with your project ref (the subdomain in
-- your Supabase API URL) and run the rest of this file.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-scheduled-account-deletions',
  '0 3 * * *', -- daily at 03:00 UTC
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-scheduled-deletions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Run this manually in the Supabase SQL editor.
--
-- "Allow public read access to profiles" is `USING (true)` with no `TO`
-- clause, so it applies to the PUBLIC role -- including `anon`. Since the
-- table has no column-level SELECT restrictions, this lets anyone with the
-- public anon key (shipped in the client JS bundle) read every user's
-- email, stripe_customer_id, and is_premium via the PostgREST API, e.g.
-- GET /rest/v1/users?select=email,stripe_customer_id,is_premium -- no
-- login required.
--
-- Nothing in the app relies on this: there's no leaderboard or public
-- profile feature (checked app/), and /api/user/me reads its own row
-- through "Users can view their own profile." (auth.uid() = id), not this
-- policy. The public.users <-> auth.users sync triggers (handle_new_user,
-- handle_public_user_profile_change, handle_user_email_change,
-- handle_user_metadata_change) are all SECURITY DEFINER and bypass RLS
-- entirely, so they're unaffected too.

drop policy "Allow public read access to profiles" on public.users;

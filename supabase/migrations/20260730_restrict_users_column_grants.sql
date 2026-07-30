-- The RLS policy "Allow individual updates to own profile" only checks row
-- ownership (auth.uid() = id) — it does not restrict which columns a user
-- can write. Without this, a logged-in user could bypass our /api/user/me
-- validation entirely and call the Supabase client directly to set their own
-- email, stripe_customer_id, or is_premium. Column-level grants close that:
-- only the columns the app actually lets users edit stay writable by the
-- authenticated role. service_role (used by the Stripe webhook and other
-- backend paths) is untouched by this REVOKE.

revoke update on public.users from authenticated;
grant update (display_name, avatar_url, updated_at) on public.users to authenticated;

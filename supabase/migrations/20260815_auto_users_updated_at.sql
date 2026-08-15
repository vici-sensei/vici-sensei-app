-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- updated_at was the one column still in the authenticated UPDATE grant from
-- 20260730_restrict_users_column_grants.sql purely so the client could stamp
-- it on every profile edit -- it let a user set their own updated_at to
-- anything. A BEFORE UPDATE trigger now sets it server-side on every update
-- (including the service-role writes from the Stripe webhook, which never
-- touched it before), so the client no longer needs write access to it at
-- all -- see the matching lib/client-data/userProfile.ts change that drops
-- updated_at from the update payloads.

create or replace function public.set_users_updated_at()
 returns trigger
 language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

create trigger set_users_updated_at_trigger
before update on public.users
for each row execute function public.set_users_updated_at();

revoke update on public.users from authenticated;
grant update (display_name, avatar_url, country) on public.users to authenticated;

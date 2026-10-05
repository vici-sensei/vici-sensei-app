-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text. Never the frozen project.
--
-- Email + password sign-in (docs/PASSWORD_AUTH_PLAN.md, phase 1).
--
-- The "@gmail.com only" rule used to live on the account's email (trigger on auth.users + CHECK on
-- public.users). It was there because Google was the only way in. People with another provider
-- (Outlook, Yahoo, iCloud, a school address) must be able to sign up with a password, so the rule
-- now applies to what it was always about: Google identities.
--
--  * on_auth_user_require_gmail / enforce_gmail_email() and users_email_gmail_check are gone.
--  * enforce_google_identity_gmail() + on_auth_identity_require_gmail reject a `google` row in
--    auth.identities whose email isn't @gmail.com. That covers a new Google signup, linkIdentity()
--    (Settings -> link Google) and "Switch Google account". `email` identities are unrestricted.
--  * handle_new_user() no longer invents the name "User Nou" for accounts that don't come from
--    Google: a password signup has no full_name, so display_name stays NULL and onboarding asks for
--    it (the leaderboard already renders NULL as "Anonymous user", the header menu falls back to
--    the email). Google accounts keep the old fallback. The rest of the body is the live version
--    from 20260923152640_premium_trial.sql (7-day Pro trial), not the baseline's.
--  * has_password() -- RPC for Settings: does the caller have a password? (see its comment below)
--
-- Nothing changes for the 8 existing users, all Google with @gmail.com. The Email provider is still
-- switched off in both Dashboards, so no password account can exist until that is turned on.

begin;

drop trigger if exists on_auth_user_require_gmail on auth.users;
drop function if exists public.enforce_gmail_email();
alter table public.users drop constraint if exists users_email_gmail_check;

create or replace function public.enforce_google_identity_gmail()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider = 'google' and coalesce(new.identity_data ->> 'email', '') !~* '^[^@\s]+@gmail\.com$' then
    raise exception 'Only @gmail.com Google accounts are allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_identity_require_gmail on auth.identities;
create trigger on_auth_identity_require_gmail
  before insert or update of identity_data on auth.identities
  for each row execute function public.enforce_google_identity_gmail();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, display_name, avatar_url, is_premium, premium_until)
  values (
    new.id,
    new.email,
    case
      when new.raw_app_meta_data ->> 'provider' = 'google'
        then left(coalesce(new.raw_user_meta_data ->> 'full_name', 'User Nou'), 50)
      else left(nullif(new.raw_user_meta_data ->> 'full_name', ''), 50)
    end,
    new.raw_user_meta_data ->> 'avatar_url',
    true,
    now() + interval '7 days'
  );

  insert into public.user_study_settings (user_id)
  values (new.id);

  insert into public.leaderboard_stats (user_id)
  values (new.id);

  return new;
end;
$$;

-- Whether the caller has a password. Supabase's User object doesn't say (a Google account that
-- later adds a password may not get an `email` identity), and Settings needs it to show "Change
-- password" vs "Add a password" and to decide which sign-in methods can be removed.
create or replace function public.has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.encrypted_password <> '' from auth.users u where u.id = auth.uid()), false);
$$;

revoke all on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;

commit;

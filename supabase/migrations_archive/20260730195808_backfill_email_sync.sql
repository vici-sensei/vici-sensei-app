-- One-time fix for rows where public.users.email drifted from auth.users.email
-- before the on_auth_user_email_changed trigger (20260730_sync_auth_email_change.sql)
-- existed. Safe to re-run: only touches rows that are still out of sync.
-- auth.users is the source of truth for email since it's the login credential.

update public.users u
set email = a.email,
    updated_at = now()
from auth.users a
where u.id = a.id
  and u.email is distinct from a.email;

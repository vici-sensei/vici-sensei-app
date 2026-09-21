-- Run this manually in DBeaver or the Supabase SQL editor.
-- Audit trail for DELETE /api/user/me. Deliberately holds no PII (no email,
-- no name) since the point is to prove a deletion happened without
-- recreating the data that was supposed to be erased. No FK to
-- public.users on purpose -- an ON DELETE CASCADE there would wipe this
-- row together with the account it's meant to be evidence for.

create table public.account_deletion_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  deleted_at timestamptz not null default now(),
  had_active_subscription boolean not null default false,
  stripe_customer_deleted boolean not null default false
);

alter table public.account_deletion_log enable row level security;
-- No policies: RLS with zero policies denies anon/authenticated roles by
-- default. Only the service-role client (which bypasses RLS) can read or
-- write this table -- users must never see their own deletion log entry.

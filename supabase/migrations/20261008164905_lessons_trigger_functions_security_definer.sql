-- Scope: EU only (the `lessons` writer schema exists only on the EU project).
-- Every write RPC (create class, set student access, enroll, ...) failed at COMMIT with
-- "permission denied for schema lessons": the deferred constraint triggers (waitlist_after_*, google_after_*)
-- run lessons.waitlist_trigger() / lessons.google_dirty_trigger() with the rights of the ACTIVE role, which for a
-- PostgREST call is service_role, and service_role has no USAGE on schema lessons. The local tests ran as
-- superuser and the dry-runs ended in ROLLBACK, so deferred triggers never fired under the real role.
-- SECURITY DEFINER makes both run as the owner (postgres), like every public.lesson_* function.
alter function lessons.waitlist_trigger() security definer set search_path = pg_catalog, lessons;
alter function lessons.google_dirty_trigger() security definer set search_path = pg_catalog, lessons;

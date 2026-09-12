-- public.free_lesson_leads has RLS enabled but, until now, no SELECT policy at all -- only two
-- (redundant) INSERT policies for `anon` covering the public signup form. That meant nobody,
-- not even admins, could read the table through PostgREST; only service_role could bypass RLS.
--
-- This adds read access for admins (public.users.admin = true), so they can work the leads from
-- an in-app /admin page. Mirrors the existing "Admins can view error_logs" policy
-- (20261001_add_error_logs_table.sql) -- no shared is_admin() helper exists yet, so the admin
-- check is inlined the same way here.

CREATE POLICY "Admins can view free_lesson_leads" ON public.free_lesson_leads
 AS PERMISSIVE
 FOR SELECT
 TO authenticated
 USING (COALESCE((SELECT admin FROM public.users WHERE id = (SELECT auth.uid())), false));

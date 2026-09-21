-- Admins can view free_lesson_leads (20261111_admin_can_view_free_lesson_leads.sql) but there is
-- still no UPDATE policy, so the new "Contacted" toggle on /admin/leads has nothing to write to.
--
-- Column grants are tightened the same way as public.users (20260730_restrict_users_column_grants.sql)
-- so admins can only ever flip `contacted` through the API, not rewrite name/whatsapp/consent.

CREATE POLICY "Admins can update free_lesson_leads contacted" ON public.free_lesson_leads
 AS PERMISSIVE
 FOR UPDATE
 TO authenticated
 USING (COALESCE((SELECT admin FROM public.users WHERE id = (SELECT auth.uid())), false))
 WITH CHECK (COALESCE((SELECT admin FROM public.users WHERE id = (SELECT auth.uid())), false));

REVOKE UPDATE ON public.free_lesson_leads FROM authenticated;
GRANT UPDATE (contacted) ON public.free_lesson_leads TO authenticated;

-- cezarateodorescu8@gmail.com / bluekitsunebi@gmail.com / vici.sensei@gmail.com /
-- vicentiuchesca@gmail.com are fictional accounts used only for local development --
-- excluded at the RLS layer (not just the client lib) so dev/test noise can never reach
-- the archive even if a future client-side change forgets to filter them out.
ALTER POLICY "Users can insert own error_logs" ON public.error_logs
  WITH CHECK (
    ((( SELECT auth.uid() AS uid) = user_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND email = ANY (ARRAY[
          'cezarateodorescu8@gmail.com',
          'bluekitsunebi@gmail.com',
          'vici.sensei@gmail.com',
          'vicentiuchesca@gmail.com'
        ])
    )
  );

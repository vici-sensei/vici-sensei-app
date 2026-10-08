-- EU-new + US-new BOTH, identical text. Apply to BOTH projects before either of the
-- *_lesson_teacher_flag_mirror_{eu,us}.sql files: those add is_teacher to the other region's
-- postgres_fdw foreign table, and the mirror refresh (`SELECT *`, positional) breaks on every run
-- until the remote public.users actually has the column.
--
-- Lesson booking (docs/LESSON_BOOKING_PLAN.md): a teacher is an ordinary account with this flag.
-- It is set by an admin through the Worker (/api/lessons/*), never by the user: `authenticated` only
-- has column-level UPDATE on four profile fields (20260922222732_grant_users_self_edit_columns.sql),
-- so a new column is server-controlled without any extra REVOKE. Table-level SELECT already lets a
-- user read it on their own row.
--
-- Appended LAST, like premium_until before it, so public.users, mirror_{us,eu}.users and
-- mirror_{us,eu}_fdw.users keep identical column order (verified live on 2026-10-08: all lists end in
-- premium_until on both projects).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_teacher boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_teacher IS
  'Teaches lesson classes (lessons.* on the EU writer). Set by an admin via the Worker only; a teacher account cannot also be a student.';

-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 6 of docs/LESSON_BOOKING_PLAN.md: a region move can
-- carry the student's lessons over. The Worker calls lesson_rekey_student from the move's "update_ledger" step,
-- and a step can run more than once (it is retried until it succeeds), so the call must be safe to repeat:
--   * nothing to move (already moved, or the person never used lessons) is not an error any more;
--   * only "the old key AND the new key both have a student row" is refused (two people's data would merge);
--   * the teacher references the move must carry too (a substitute teacher on a lesson, a teacher's vacation)
--     are re-pointed along with the classes the person teaches.
-- It returns a small report (jsonb) instead of void, so the Worker can log what happened.
--
-- Also: lesson_list_student_keys now says whether each student still has access (for the weekly account sweep).

drop function public.lesson_rekey_student(text, uuid, text, uuid);

create function public.lesson_rekey_student(p_old_region text, p_old_id uuid, p_new_region text, p_new_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_student boolean;
  v_classes int;
  v_overrides int;
  v_vacations int;
begin
  if p_old_region not in ('eu', 'us') or p_new_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  perform lessons.lock();
  if p_old_region = p_new_region and p_old_id = p_new_id then
    return jsonb_build_object('student', false, 'classes', 0, 'overrides', 0, 'vacations', 0);
  end if;

  v_student := exists (select 1 from lessons.students s where s.region = p_old_region and s.user_id = p_old_id);
  if v_student and exists (select 1 from lessons.students s where s.region = p_new_region and s.user_id = p_new_id) then
    perform lessons.fail('target_exists');
  end if;

  -- Everything that hangs off the student row (enrollments, moves, waitlist, notifications, devices, week
  -- settings, attendance, extras, preferences) follows by ON UPDATE CASCADE.
  if v_student then
    update lessons.students set region = p_new_region, user_id = p_new_id where region = p_old_region and user_id = p_old_id;
  end if;
  update lessons.class_versions set teacher_region = p_new_region, teacher_id = p_new_id
  where teacher_region = p_old_region and teacher_id = p_old_id;
  get diagnostics v_classes = row_count;
  update lessons.occurrence_overrides set teacher_region = p_new_region, teacher_id = p_new_id
  where teacher_region = p_old_region and teacher_id = p_old_id;
  get diagnostics v_overrides = row_count;
  update lessons.vacations set teacher_region = p_new_region, teacher_id = p_new_id
  where teacher_region = p_old_region and teacher_id = p_old_id;
  get diagnostics v_vacations = row_count;

  if v_student or v_classes + v_overrides + v_vacations > 0 then
    perform lessons.log(null, null, 'rekey', jsonb_build_object(
      'old', jsonb_build_object('region', p_old_region, 'user_id', p_old_id),
      'new', jsonb_build_object('region', p_new_region, 'user_id', p_new_id),
      'student', v_student, 'classes', v_classes, 'overrides', v_overrides, 'vacations', v_vacations));
  end if;
  return jsonb_build_object('student', v_student, 'classes', v_classes, 'overrides', v_overrides, 'vacations', v_vacations);
end;
$$;

-- The weekly sweep of accounts that went away (worker/lib/lessonsAccounts.ts) only needs to act on students that
-- still hold seats: it is told whether each one still has access.
create or replace function public.lesson_list_student_keys() returns jsonb
language sql stable security definer set search_path = pg_catalog, lessons
as $$
  select coalesce(jsonb_agg(jsonb_build_object('region', s.region, 'user_id', s.user_id, 'access', s.access)), '[]'::jsonb)
  from lessons.students s
$$;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'lesson\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

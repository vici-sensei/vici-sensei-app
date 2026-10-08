-- EU-new ONLY (the lesson writer lives here; US-new has no `lessons` schema). Replaces
-- public.lesson_get_schedule from 20261008074504_lessons_writer_core.sql -- same signature, so the
-- service_role-only grants stay as they are.
--
-- What the student's calendar needs and the first version did not return:
--   * student.fixed -- the student's current fixed classes (title, NY weekday/time, next lesson). The
--     class a student moved AWAY from for a week has no row in `mine`, and a fixed class can fall
--     outside the displayed range, so the page could not otherwise tell which classes are "mine".
--   * occurrence.moved_to -- on the occurrence the student gave up with a one-week move, where they go
--     instead. It lets the page draw "you moved away from this" and offer "go back" (lesson_unmove
--     takes the TARGET occurrence).
-- Nothing else about the answer changes.

create or replace function public.lesson_get_schedule(p_region text, p_user_id uuid, p_tz text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  st lessons.students;
  v_cfg lessons.student_week_cfg;
  v_pend lessons.student_week_cfg;
  v_occ jsonb;
  v_fixed jsonb;
  v_now timestamptz := lessons.now();
begin
  if p_to <= p_from or p_to - p_from > interval '124 days' then
    perform lessons.fail('invalid_range');
  end if;

  -- Reads normally take no lock; only a first visit or a timezone change writes (set_cfg).
  if not exists (
    select 1 from lessons.student_week_cfg c
    where c.region = p_region and c.user_id = p_user_id and c.effective_from <= v_now and c.tz = p_tz
      and not exists (select 1 from lessons.student_week_cfg f
                      where f.region = c.region and f.user_id = c.user_id and f.effective_from > v_now)
  ) then
    perform lessons.lock();
    perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  end if;

  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  select * into v_cfg from lessons.student_week_cfg c
  where c.region = p_region and c.user_id = p_user_id and c.effective_from <= v_now
  order by c.effective_from desc limit 1;
  select * into v_pend from lessons.student_week_cfg c
  where c.region = p_region and c.user_id = p_user_id and c.effective_from > v_now
  order by c.effective_from limit 1;

  with days as (
    select g::date as d from generate_series(
      ((p_from at time zone 'America/New_York')::date - 1)::timestamp,
      ((p_to at time zone 'America/New_York')::date + 1)::timestamp,
      interval '1 day') g
  ),
  occ as (
    select v.class_id, days.d, v.title, v.level_label, v.duration_min, v.teacher_region, v.teacher_id,
           v.capacity, v.meeting_url,
           (days.d + v.start_time) at time zone 'America/New_York' as s
    from days
    join lessons.class_versions v
      on v.valid_from <= days.d and (v.valid_until is null or days.d < v.valid_until)
     and v.weekday = extract(isodow from days.d)::int
  ),
  mine as (select * from lessons.attended(p_region, p_user_id, p_from, p_to))
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'class_id', occ.class_id,
      'ny_date', occ.d,
      'starts_at', occ.s,
      'ends_at', occ.s + make_interval(mins => occ.duration_min),
      'title', occ.title,
      'level_label', occ.level_label,
      'teacher', jsonb_build_object('region', occ.teacher_region, 'user_id', occ.teacher_id),
      'capacity', occ.capacity,
      'taken', lessons.seats_taken(occ.class_id, occ.d),
      'mine', mine.source,
      'moved_to', case when mv.id is not null then jsonb_build_object('class_id', mv.to_class, 'ny_date', mv.to_date) end,
      'meeting_url', case when mine.source is not null then occ.meeting_url end
    ) order by occ.s, occ.class_id), '[]'::jsonb)
  into v_occ
  from occ
  left join mine on mine.class_id = occ.class_id and mine.ny_date = occ.d
  left join lessons.moves mv
    on mv.region = p_region and mv.user_id = p_user_id and mv.from_class = occ.class_id and mv.from_date = occ.d
  where occ.s >= p_from and occ.s < p_to;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'class_id', e.class_id,
      'from_date', e.from_date,
      'to_date', e.to_date,
      'title', ver.title,
      'level_label', ver.level_label,
      'weekday', ver.weekday,
      'start_time', ver.start_time,
      'duration_min', ver.duration_min,
      'next_starts_at', (nd.d + ver.start_time) at time zone 'America/New_York'
    ) order by (nd.d + ver.start_time) at time zone 'America/New_York'), '[]'::jsonb)
  into v_fixed
  from lessons.enrollments e
  cross join lateral (select lessons.next_occ(e.class_id, v_now) as d) nd
  join lateral lessons.version_at(e.class_id, nd.d) ver on true
  where e.region = p_region and e.user_id = p_user_id and nd.d is not null
    and lessons.is_open(e.class_id, e.to_date);

  return jsonb_build_object(
    'student', jsonb_build_object(
      'access', lessons.has_access(st.access, st.access_until, v_now),
      'access_until', st.access_until,
      'can_move', st.can_move,
      'weekly_quota', st.weekly_quota,
      'tz', v_cfg.tz,
      'week_start', v_cfg.week_start,
      'pending', case when v_pend.effective_from is null then null else jsonb_build_object(
        'effective_from', v_pend.effective_from, 'tz', v_pend.tz, 'week_start', v_pend.week_start) end,
      'fixed', v_fixed
    ),
    'occurrences', v_occ
  );
end;
$$;

-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 3 of docs/LESSON_BOOKING_PLAN.md: what the
-- teachers' and admins' panel needs on top of 20261008074504_lessons_writer_core.sql.
--
--   * exceptions on ONE lesson without touching the weekly template: cancel, move to another day/time,
--     a substitute teacher, a different meeting link (lessons.occurrence_overrides);
--   * one-off lessons (a class with a single date), and vacations (a date range, for everybody or for
--     one teacher) that cancel whatever falls inside;
--   * "extra" attendees: staff may put a student in a lesson over its capacity or quota, with a
--     reason. They sit on EXTRA chairs: they never take a bookable seat and never block a student;
--   * enrollments and moves done by staff for a student (the same code as the student's own, minus the
--     rules staff may override: quota, can_move, time conflicts);
--   * attendance marked by the teacher;
--   * the notification table and the events that fill it (delivery and reminders come later);
--   * the reads the panel needs (overview, students, one student's detail).
--
-- An occurrence is still (class_id, template NY date): moving it only changes its INSTANT, so the
-- enrollments, one-week moves and seat counts keyed by that pair stay valid. Cancelled occurrences have
-- no start (lessons.occ_start returns null), so they hold no seats, count towards no student's week
-- (a student with a cancelled lesson has room to pick another that week) and cannot be joined.

-- ===========================================================================================
-- Tables
-- ===========================================================================================

alter table lessons.classes add column kind text not null default 'weekly' check (kind in ('weekly', 'one_off'));

create table lessons.occurrence_overrides (
  class_id uuid not null references lessons.classes(id),
  ny_date date not null,
  cancelled boolean not null default false,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  moved_date date,
  moved_time time,
  teacher_region text check (teacher_region in ('eu', 'us')),
  teacher_id uuid,
  meeting_url text check (char_length(meeting_url) <= 500 and meeting_url ~ '^https://[^[:space:]]+$'),
  updated_by_region text,
  updated_by_id uuid,
  updated_at timestamptz not null default now(),
  primary key (class_id, ny_date),
  check ((moved_date is null) = (moved_time is null)),
  -- Close to its template date, so a lesson cannot wander into another week's seats.
  check (moved_date is null or abs(moved_date - ny_date) <= 6),
  check (moved_date is null or not (extract(isodow from moved_date) = 7 and moved_time >= time '01:00' and moved_time < time '03:00')),
  check ((teacher_region is null) = (teacher_id is null))
);

create table lessons.vacations (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('global', 'teacher')),
  teacher_region text check (teacher_region in ('eu', 'us')),
  teacher_id uuid,
  from_date date not null,
  to_date date not null,                  -- inclusive, New York dates
  reason text check (char_length(reason) <= 200),
  created_by_region text,
  created_by_id uuid,
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 120),
  check ((scope = 'global') = (teacher_id is null)),
  check ((teacher_region is null) = (teacher_id is null))
);

create table lessons.extras (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  class_id uuid not null references lessons.classes(id),
  from_date date not null,
  to_date date,                           -- exclusive; null = every lesson from from_date on
  reason text check (char_length(reason) <= 200),
  added_by_region text,
  added_by_id uuid,
  created_at timestamptz not null default now(),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade,
  check (to_date is null or to_date > from_date)
);
create index extras_class_idx on lessons.extras (class_id, from_date);
create index extras_student_idx on lessons.extras (region, user_id);

create table lessons.attendance (
  class_id uuid not null references lessons.classes(id),
  ny_date date not null,
  region text not null,
  user_id uuid not null,
  status text not null check (status in ('present', 'absent')),
  marked_by_region text,
  marked_by_id uuid,
  marked_at timestamptz not null default now(),
  primary key (class_id, ny_date, region, user_id),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade
);

-- What a student is told. One row per event; the same event is never stored twice (dedup_key), so a
-- job that runs again cannot send it again.
create table lessons.notifications (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  kind text not null,
  dedup_key text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_state text not null default 'none' check (email_state in ('none', 'pending', 'sent', 'failed', 'skipped')),
  email_sent_at timestamptz,
  email_error text,
  push_state text not null default 'none' check (push_state in ('none', 'pending', 'sent', 'failed', 'skipped')),
  push_sent_at timestamptz,
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade,
  unique (region, user_id, dedup_key)
);
create index notifications_user_idx on lessons.notifications (region, user_id, created_at desc);
create index notifications_pending_idx on lessons.notifications (id) where email_state = 'pending' or push_state = 'pending';

alter table lessons.occurrence_overrides enable row level security;
alter table lessons.vacations enable row level security;
alter table lessons.extras enable row level security;
alter table lessons.attendance enable row level security;
alter table lessons.notifications enable row level security;
revoke all on all tables in schema lessons from public, anon, authenticated;

-- ===========================================================================================
-- Occurrence helpers (overrides, vacations)
-- ===========================================================================================

create function lessons.effective_teacher(p_class uuid, p_date date) returns table(teacher_region text, teacher_id uuid)
language sql stable as $$
  select coalesce(o.teacher_region, v.teacher_region), coalesce(o.teacher_id, v.teacher_id)
  from lessons.version_at(p_class, p_date) v
  left join lessons.occurrence_overrides o on o.class_id = p_class and o.ny_date = p_date
$$;

-- The New York date the lesson really happens on (its template date unless it was moved).
create function lessons.occ_eff_date(p_class uuid, p_date date) returns date
language sql stable as $$
  select coalesce((select o.moved_date from lessons.occurrence_overrides o where o.class_id = p_class and o.ny_date = p_date), p_date)
$$;

create function lessons.is_cancelled(p_class uuid, p_date date) returns boolean
language sql stable as $$
  select coalesce((select o.cancelled from lessons.occurrence_overrides o where o.class_id = p_class and o.ny_date = p_date), false)
    or exists (
      select 1 from lessons.vacations vac
      where lessons.occ_eff_date(p_class, p_date) between vac.from_date and vac.to_date
        and (vac.scope = 'global'
             or exists (select 1 from lessons.effective_teacher(p_class, p_date) t
                        where t.teacher_region = vac.teacher_region and t.teacher_id = vac.teacher_id))
    )
$$;

-- The instants of an occurrence as scheduled (moved if it was moved), cancelled or not.
create function lessons.occ_start_any(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select (coalesce(o.moved_date, p_date) + coalesce(o.moved_time, v.start_time)) at time zone 'America/New_York'
  from lessons.version_at(p_class, p_date) v
  left join lessons.occurrence_overrides o on o.class_id = p_class and o.ny_date = p_date
$$;

create function lessons.occ_end_any(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select ((coalesce(o.moved_date, p_date) + coalesce(o.moved_time, v.start_time)) at time zone 'America/New_York')
         + make_interval(mins => v.duration_min)
  from lessons.version_at(p_class, p_date) v
  left join lessons.occurrence_overrides o on o.class_id = p_class and o.ny_date = p_date
$$;

-- Same, but null for a cancelled lesson: nothing that asks "when does it start" sees a lesson that is not
-- happening (seats, quota weeks, joining, reminders).
create or replace function lessons.occ_start(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select case when lessons.is_cancelled(p_class, p_date) then null else lessons.occ_start_any(p_class, p_date) end
$$;

create or replace function lessons.occ_end(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select case when lessons.is_cancelled(p_class, p_date) then null else lessons.occ_end_any(p_class, p_date) end
$$;

-- A moved lesson can sit up to 6 days from its template date, so the scan starts a week earlier.
create or replace function lessons.next_occ(p_class uuid, p_after timestamptz) returns date
language sql stable as $$
  with base as (
    select greatest((p_after at time zone 'America/New_York')::date, min(v.valid_from)) as d0
    from lessons.class_versions v
    where v.class_id = p_class
      and (v.valid_until is null or v.valid_until > (p_after at time zone 'America/New_York')::date)
  )
  select g::date
  from base, generate_series((base.d0 - 7)::timestamp, (base.d0 + 14)::timestamp, interval '1 day') g
  where lessons.occ_start(p_class, g::date) > p_after
  order by lessons.occ_start(p_class, g::date)
  limit 1
$$;

-- Everyone who attends a lesson: fixed class members (minus those who moved away), one-week moves in,
-- extra attendees; all with access at its start. Works for cancelled lessons too (to tell them).
create function lessons.occ_attendees(p_class uuid, p_date date) returns table(region text, user_id uuid, source text, attendance text)
language sql stable as $$
  select a.region, a.user_id, a.source, att.status
  from (
    select e.region, e.user_id, 'standing'::text as source from lessons.enrollments e
    where e.class_id = p_class and e.from_date <= p_date and (e.to_date is null or p_date < e.to_date)
      and not exists (
        select 1 from lessons.moves m
        where m.region = e.region and m.user_id = e.user_id and m.from_class = p_class and m.from_date = p_date)
    union all
    select m.region, m.user_id, 'move' from lessons.moves m where m.to_class = p_class and m.to_date = p_date
    union all
    select x.region, x.user_id, 'extra' from lessons.extras x
    where x.class_id = p_class and x.from_date <= p_date and (x.to_date is null or p_date < x.to_date)
  ) a
  join lessons.students st on st.region = a.region and st.user_id = a.user_id
  left join lessons.attendance att
    on att.class_id = p_class and att.ny_date = p_date and att.region = a.region and att.user_id = a.user_id
  where lessons.has_access(st.access, st.access_until, lessons.occ_start_any(p_class, p_date))
$$;

-- Extra chairs only: not part of lessons.seats_taken, shown beside it.
create function lessons.extras_count(p_class uuid, p_date date) returns int
language sql stable as $$
  select count(*)::int from lessons.extras x
  where x.class_id = p_class and x.from_date <= p_date and (x.to_date is null or p_date < x.to_date)
$$;

-- Everything one student attends that STARTS in [p_from, p_to), optionally with cancelled lessons.
create function lessons.attended_x(p_region text, p_user uuid, p_from timestamptz, p_to timestamptz, p_include_cancelled boolean)
returns table(class_id uuid, ny_date date, starts_at timestamptz, ends_at timestamptz, source text)
language sql stable as $$
  with st as (select * from lessons.students s where s.region = p_region and s.user_id = p_user),
  days as (
    select g::date as d from generate_series(
      ((p_from at time zone 'America/New_York')::date - 8)::timestamp,
      ((p_to at time zone 'America/New_York')::date + 8)::timestamp,
      interval '1 day') g
  ),
  cand as (
    select e.class_id, days.d as ny_date, 'standing'::text as source
    from lessons.enrollments e cross join days
    where e.region = p_region and e.user_id = p_user
      and e.from_date <= days.d and (e.to_date is null or days.d < e.to_date)
      and not exists (
        select 1 from lessons.moves m
        where m.region = p_region and m.user_id = p_user and m.from_class = e.class_id and m.from_date = days.d)
    union all
    select m.to_class, m.to_date, 'move'::text
    from lessons.moves m
    where m.region = p_region and m.user_id = p_user
      and m.to_date between (select min(d) from days) and (select max(d) from days)
    union all
    select x.class_id, days.d, 'extra'::text
    from lessons.extras x cross join days
    where x.region = p_region and x.user_id = p_user
      and x.from_date <= days.d and (x.to_date is null or days.d < x.to_date)
  )
  select c.class_id, c.ny_date, o.s, o.e, c.source
  from cand c
  cross join lateral (
    select case when p_include_cancelled then lessons.occ_start_any(c.class_id, c.ny_date) else lessons.occ_start(c.class_id, c.ny_date) end as s,
           case when p_include_cancelled then lessons.occ_end_any(c.class_id, c.ny_date) else lessons.occ_end(c.class_id, c.ny_date) end as e
  ) o
  cross join st
  where o.s is not null and o.s >= p_from and o.s < p_to and lessons.has_access(st.access, st.access_until, o.s)
$$;

create or replace function lessons.attended(p_region text, p_user uuid, p_from timestamptz, p_to timestamptz)
returns table(class_id uuid, ny_date date, starts_at timestamptz, ends_at timestamptz, source text)
language sql stable as $$
  select * from lessons.attended_x(p_region, p_user, p_from, p_to, false)
$$;

-- ===========================================================================================
-- Notifications (the events; delivery, reminders and preferences come in a later migration)
-- ===========================================================================================

-- "Tue 3 Mar, 02:00" in the student's own timezone (the one their week is judged in).
create function lessons.fmt_local(p_at timestamptz, p_region text, p_user uuid) returns text
language sql stable as $$
  select to_char(
    p_at at time zone coalesce(
      (select c.tz from lessons.student_week_cfg c
       where c.region = p_region and c.user_id = p_user and c.effective_from <= lessons.now()
       order by c.effective_from desc limit 1), 'UTC'),
    'FMDy FMDD FMMon, HH24:MI')
$$;

create function lessons.notify(
  p_region text, p_user uuid, p_kind text, p_dedup text, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb, p_email boolean default true)
returns void
language sql as $$
  insert into lessons.notifications (region, user_id, kind, dedup_key, title, body, data, email_state)
  values (p_region, p_user, p_kind, p_dedup, p_title, p_body, p_data, case when p_email then 'pending' else 'none' end)
  on conflict (region, user_id, dedup_key) do nothing
$$;

-- ===========================================================================================
-- Replaced helpers: timezone changes notify, leaving drops extras too
-- ===========================================================================================

create or replace function lessons.set_cfg(p_region text, p_user uuid, p_tz text, p_week_start int) returns void
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  cur lessons.student_week_cfg;
  pend lessons.student_week_cfg;
  v_tz text;
  v_ws int;
  v_end timestamptz;
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  if p_tz is not null and not exists (select 1 from pg_timezone_names n where n.name = p_tz) then
    perform lessons.fail('invalid_timezone');
  end if;
  if p_week_start is not null and p_week_start not between 1 and 7 then
    perform lessons.fail('invalid_week_start');
  end if;

  insert into lessons.students (region, user_id) values (p_region, p_user) on conflict do nothing;

  select * into cur from lessons.student_week_cfg c
  where c.region = p_region and c.user_id = p_user and c.effective_from <= v_now
  order by c.effective_from desc limit 1;

  if not found then
    insert into lessons.student_week_cfg (region, user_id, effective_from, tz, week_start)
    values (p_region, p_user, '-infinity', coalesce(p_tz, 'UTC'), coalesce(p_week_start, 1));
    return;
  end if;

  select * into pend from lessons.student_week_cfg c
  where c.region = p_region and c.user_id = p_user and c.effective_from > v_now
  order by c.effective_from limit 1;

  v_tz := coalesce(p_tz, pend.tz, cur.tz);
  v_ws := coalesce(p_week_start, pend.week_start, cur.week_start);

  if pend.effective_from is not null and v_tz = pend.tz and v_ws = pend.week_start then
    return;
  elsif v_tz = cur.tz and v_ws = cur.week_start then
    delete from lessons.student_week_cfg c
    where c.region = p_region and c.user_id = p_user and c.effective_from > v_now;
  elsif pend.effective_from is not null then
    update lessons.student_week_cfg c set tz = v_tz, week_start = v_ws
    where c.region = p_region and c.user_id = p_user and c.effective_from = pend.effective_from;
  else
    select w.win_end into v_end from lessons.week_window(p_region, p_user, v_now) w;
    insert into lessons.student_week_cfg (region, user_id, effective_from, tz, week_start)
    values (p_region, p_user, v_end, v_tz, v_ws);
  end if;

  -- The timezone changed by itself (they travelled, or picked another one): tell them when the
  -- lessons start counting in it. A week-start change is the student's own doing, no message.
  if p_tz is not null and p_tz <> cur.tz and v_tz = p_tz and (pend.effective_from is null or pend.tz <> p_tz) then
    select c.effective_from into v_end from lessons.student_week_cfg c
    where c.region = p_region and c.user_id = p_user and c.effective_from > v_now order by c.effective_from limit 1;
    perform lessons.notify(
      p_region, p_user, 'tz_changed', 'tz:' || p_tz || ':' || extract(epoch from v_end)::bigint,
      'Your timezone changed',
      format('Your lessons are now shown in %s. For your weekly limit the new timezone counts from %s.',
             p_tz, to_char(v_end at time zone p_tz, 'FMDy FMDD FMMon')),
      jsonb_build_object('tz', p_tz, 'effective_from', v_end), false);
  end if;
end;
$$;

create or replace function lessons.drop_future(p_region text, p_user uuid) returns void
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  e lessons.enrollments;
  v_end date;
begin
  for e in select * from lessons.enrollments x where x.region = p_region and x.user_id = p_user
    and lessons.is_open(x.class_id, x.to_date)
  loop
    v_end := coalesce(lessons.next_occ(e.class_id, v_now), lessons.ny_today());
    if v_end <= e.from_date then
      delete from lessons.enrollments where id = e.id;
    else
      update lessons.enrollments set to_date = least(coalesce(to_date, v_end), v_end) where id = e.id;
    end if;
  end loop;
  delete from lessons.moves m
  where m.region = p_region and m.user_id = p_user and lessons.occ_start(m.to_class, m.to_date) > v_now;
  update lessons.moves m set from_class = null, from_date = null
  where m.region = p_region and m.user_id = p_user and m.from_class is not null
    and lessons.occ_start(m.from_class, m.from_date) > v_now;
  delete from lessons.extras x where x.region = p_region and x.user_id = p_user and x.from_date > lessons.ny_today();
  update lessons.extras x set to_date = least(coalesce(x.to_date, lessons.ny_today() + 1), lessons.ny_today() + 1)
  where x.region = p_region and x.user_id = p_user and (x.to_date is null or x.to_date > lessons.ny_today() + 1);
end;
$$;

-- A cancelled lesson has no start (null); nothing may be considered accessible at "no time". Before this,
-- has_access(true, null, null) was true and a cancelled lesson kept counting its seats.
create or replace function lessons.has_access(p_access boolean, p_until timestamptz, p_at timestamptz) returns boolean
language sql immutable as $$ select p_at is not null and p_access and (p_until is null or p_at < p_until) $$;

-- Microseconds since the epoch of the writer's clock, for notification keys: two events of one kind a
-- second apart are two events.
create function lessons.stamp() returns text
language sql stable as $$ select ((extract(epoch from lessons.now()) * 1000000)::bigint)::text $$;

-- ===========================================================================================
-- Role checks
-- ===========================================================================================

create function lessons.require_role(p_role text, p_admin_only boolean default false) returns void
language plpgsql as $$
begin
  if p_role = 'admin' or (p_role = 'teacher' and not p_admin_only) then
    return;
  end if;
  perform lessons.fail('forbidden');
end;
$$;

-- A teacher manages a lesson only when they are its teacher (the substitute, if there is one).
create function lessons.assert_manage_occurrence(p_actor_region text, p_actor_id uuid, p_role text, p_class uuid, p_date date)
returns void
language plpgsql as $$
begin
  if not exists (select 1 from lessons.version_at(p_class, p_date)) then
    perform lessons.fail('not_an_occurrence');
  end if;
  if p_role = 'admin' then
    return;
  end if;
  if p_role = 'teacher' and exists (
    select 1 from lessons.effective_teacher(p_class, p_date) t where t.teacher_region = p_actor_region and t.teacher_id = p_actor_id
  ) then
    return;
  end if;
  perform lessons.fail('forbidden');
end;
$$;

-- ... and a class only when they teach its next lesson.
create function lessons.assert_manage_class(p_actor_region text, p_actor_id uuid, p_role text, p_class uuid) returns void
language plpgsql as $$
declare
  d date;
begin
  if p_role = 'admin' then
    return;
  end if;
  d := lessons.next_occ(p_class, lessons.now());
  if p_role = 'teacher' and d is not null and exists (
    select 1 from lessons.effective_teacher(p_class, d) t where t.teacher_region = p_actor_region and t.teacher_id = p_actor_id
  ) then
    return;
  end if;
  perform lessons.fail('forbidden');
end;
$$;

-- ===========================================================================================
-- The student's operations as internal implementations (p_staff = staff overrides the student's rules)
-- ===========================================================================================

create function lessons.enroll_impl(p_region text, p_user uuid, p_class uuid, p_replace uuid, p_staff boolean) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  v_from date;
  v_existing lessons.enrollments;
  v_old lessons.enrollments;
  v_open int;
  v_end date;
begin
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user;

  if not lessons.has_access(st.access, st.access_until, v_now) then
    perform lessons.fail('no_access');
  end if;
  v_from := lessons.next_occ(p_class, v_now);
  if v_from is null then
    perform lessons.fail('class_not_found');
  end if;
  if (select c.kind from lessons.classes c where c.id = p_class) is distinct from 'weekly' then
    perform lessons.fail('not_a_weekly_class');
  end if;
  if not lessons.has_access(st.access, st.access_until, lessons.occ_start(p_class, v_from)) then
    perform lessons.fail('no_access');
  end if;
  if p_replace = p_class then
    perform lessons.fail('invalid_request');
  end if;

  select * into v_existing from lessons.enrollments e
  where e.region = p_region and e.user_id = p_user and e.class_id = p_class and lessons.is_open(e.class_id, e.to_date)
  order by e.id desc limit 1;
  if found and v_existing.to_date is null then
    perform lessons.fail('already_enrolled');
  end if;

  if p_replace is null then
    if not p_staff then
      select count(*) into v_open from lessons.enrollments e
      where e.region = p_region and e.user_id = p_user and e.class_id <> p_class and lessons.is_open(e.class_id, e.to_date);
      if v_open >= st.weekly_quota then
        perform lessons.fail('quota_reached');
      end if;
    end if;
  else
    if not st.can_move and not p_staff then
      perform lessons.fail('cannot_move');
    end if;
    select * into v_old from lessons.enrollments e
    where e.region = p_region and e.user_id = p_user and e.class_id = p_replace and lessons.is_open(e.class_id, e.to_date)
    order by e.id desc limit 1;
    if not found then
      perform lessons.fail('not_enrolled');
    end if;
    v_end := coalesce(lessons.next_occ(p_replace, v_now), lessons.ny_today());
    if v_end <= v_old.from_date then
      delete from lessons.enrollments where id = v_old.id;
    else
      update lessons.enrollments set to_date = least(coalesce(to_date, v_end), v_end) where id = v_old.id;
    end if;
    -- A one-week move away from an occurrence that is no longer the student's fixed one is just an extra lesson now.
    update lessons.moves m set from_class = null, from_date = null
    where m.region = p_region and m.user_id = p_user and m.from_class = p_replace and m.from_date >= v_end;
  end if;

  if v_existing.id is not null then
    update lessons.enrollments set to_date = null where id = v_existing.id;
  else
    insert into lessons.enrollments (region, user_id, class_id, from_date) values (p_region, p_user, p_class, v_from);
  end if;

  perform lessons.assert_capacity(p_class, v_from);
  if not p_staff then
    perform lessons.assert_no_overlap(p_region, p_user, p_class, v_now);
  end if;

  return jsonb_build_object('class_id', p_class, 'from_date', v_from, 'replaced', p_replace);
end;
$$;

create function lessons.unenroll_impl(p_region text, p_user uuid, p_class uuid, p_staff boolean) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  v_old lessons.enrollments;
  v_end date;
begin
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user;
  if not st.can_move and not p_staff then
    perform lessons.fail('cannot_move');
  end if;
  select * into v_old from lessons.enrollments e
  where e.region = p_region and e.user_id = p_user and e.class_id = p_class and lessons.is_open(e.class_id, e.to_date)
  order by e.id desc limit 1;
  if not found then
    perform lessons.fail('not_enrolled');
  end if;
  v_end := coalesce(lessons.next_occ(p_class, v_now), lessons.ny_today());
  if v_end <= v_old.from_date then
    delete from lessons.enrollments where id = v_old.id;
  else
    update lessons.enrollments set to_date = least(coalesce(to_date, v_end), v_end) where id = v_old.id;
  end if;
  update lessons.moves m set from_class = null, from_date = null
  where m.region = p_region and m.user_id = p_user and m.from_class = p_class and m.from_date >= v_end;
  return jsonb_build_object('class_id', p_class, 'to_date', v_end);
end;
$$;

create function lessons.move_once_impl(
  p_region text, p_user uuid, p_to_class uuid, p_to_date date, p_from_class uuid, p_from_date date, p_staff boolean)
returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  v_to_start timestamptz;
  v_to_end timestamptz;
  v_from_start timestamptz;
  v_win_start timestamptz;
  v_win_end timestamptz;
  v_before int;
  v_after int;
begin
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user;

  if (p_from_class is null) <> (p_from_date is null) then
    perform lessons.fail('invalid_request');
  end if;
  if not st.can_move and not p_staff then
    perform lessons.fail('cannot_move');
  end if;

  if lessons.occ_start_any(p_to_class, p_to_date) is null then
    perform lessons.fail('not_an_occurrence');
  end if;
  if lessons.is_cancelled(p_to_class, p_to_date) then
    perform lessons.fail('cancelled');
  end if;
  v_to_start := lessons.occ_start(p_to_class, p_to_date);
  v_to_end := lessons.occ_end(p_to_class, p_to_date);
  if v_to_start <= v_now then
    perform lessons.fail('too_late');
  end if;
  if not lessons.has_access(st.access, st.access_until, v_to_start) then
    perform lessons.fail('no_access');
  end if;

  if exists (select 1 from lessons.attended(p_region, p_user, v_to_start, v_to_start + interval '1 second') a
             where a.class_id = p_to_class and a.ny_date = p_to_date) then
    perform lessons.fail('already_attending');
  end if;

  if p_from_class is not null then
    v_from_start := lessons.occ_start(p_from_class, p_from_date);
    if v_from_start is null or v_from_start <= v_now then
      perform lessons.fail('too_late');
    end if;
    if not exists (select 1 from lessons.attended(p_region, p_user, v_from_start, v_from_start + interval '1 second') a
                   where a.class_id = p_from_class and a.ny_date = p_from_date and a.source = 'standing') then
      perform lessons.fail('not_attending');
    end if;
  end if;

  if not p_staff then
    select w.win_start, w.win_end into v_win_start, v_win_end from lessons.week_window(p_region, p_user, v_to_start) w;

    -- The student's lessons in that week, not counting the one being given up.
    select count(*) into v_before from lessons.attended(p_region, p_user, v_win_start, v_win_end) a;
    v_after := v_before + 1 - case when v_from_start >= v_win_start and v_from_start < v_win_end then 1 else 0 end;
    if v_after > greatest(st.weekly_quota, v_before) then
      perform lessons.fail('quota_reached');
    end if;

    -- Two seats in the same class in one week, or two lessons at the same time, are not allowed.
    if exists (
      select 1 from lessons.attended(p_region, p_user, v_win_start, v_win_end) a
      where a.class_id = p_to_class and not (p_from_class is not null and a.class_id = p_from_class and a.ny_date = p_from_date)
    ) then
      perform lessons.fail('same_class_twice');
    end if;
    if exists (
      select 1 from lessons.attended(p_region, p_user, v_to_start - interval '1 day', v_to_end) a
      where a.starts_at < v_to_end and v_to_start < a.ends_at
        and not (p_from_class is not null and a.class_id = p_from_class and a.ny_date = p_from_date)
    ) then
      perform lessons.fail('time_conflict');
    end if;
  end if;

  insert into lessons.moves (region, user_id, from_class, from_date, to_class, to_date)
  values (p_region, p_user, p_from_class, p_from_date, p_to_class, p_to_date);

  perform lessons.assert_seat(p_to_class, p_to_date);

  return jsonb_build_object('to_class', p_to_class, 'to_date', p_to_date, 'from_class', p_from_class, 'from_date', p_from_date);
end;
$$;

create function lessons.unmove_impl(p_region text, p_user uuid, p_to_class uuid, p_to_date date, p_staff boolean) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  mv lessons.moves;
begin
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user;
  if not st.can_move and not p_staff then
    perform lessons.fail('cannot_move');
  end if;
  select * into mv from lessons.moves m
  where m.region = p_region and m.user_id = p_user and m.to_class = p_to_class and m.to_date = p_to_date;
  if not found then
    perform lessons.fail('not_found');
  end if;
  if coalesce(lessons.occ_start_any(mv.to_class, mv.to_date), '-infinity') <= v_now then
    perform lessons.fail('too_late');
  end if;
  delete from lessons.moves where id = mv.id;
  if mv.from_class is not null then
    perform lessons.assert_seat(mv.from_class, mv.from_date);
  end if;
  return jsonb_build_object('to_class', p_to_class, 'to_date', p_to_date);
end;
$$;

-- The student's own endpoints: same signatures as before, now thin wrappers.

create or replace function public.lesson_enroll(p_region text, p_user_id uuid, p_tz text, p_class_id uuid, p_replace_class_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.enroll_impl(p_region, p_user_id, p_class_id, p_replace_class_id, false);
  perform lessons.log(p_region, p_user_id, 'enroll',
    jsonb_build_object('class_id', p_class_id, 'replaces', p_replace_class_id, 'from_date', r->'from_date'));
  return r;
end;
$$;

create or replace function public.lesson_unenroll(p_region text, p_user_id uuid, p_tz text, p_class_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.unenroll_impl(p_region, p_user_id, p_class_id, false);
  perform lessons.log(p_region, p_user_id, 'unenroll', r);
  return r;
end;
$$;

create or replace function public.lesson_move_once(
  p_region text, p_user_id uuid, p_tz text, p_to_class uuid, p_to_date date,
  p_from_class uuid default null, p_from_date date default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.move_once_impl(p_region, p_user_id, p_to_class, p_to_date, p_from_class, p_from_date, false);
  perform lessons.log(p_region, p_user_id, 'move_once', r);
  return r;
end;
$$;

create or replace function public.lesson_unmove(p_region text, p_user_id uuid, p_tz text, p_to_class uuid, p_to_date date)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.unmove_impl(p_region, p_user_id, p_to_class, p_to_date, false);
  perform lessons.log(p_region, p_user_id, 'unmove', r);
  return r;
end;
$$;

-- ===========================================================================================
-- The student's calendar, now with cancelled / moved / substituted lessons, extras and attendance
-- ===========================================================================================

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
      ((p_from at time zone 'America/New_York')::date - 8)::timestamp,
      ((p_to at time zone 'America/New_York')::date + 8)::timestamp,
      interval '1 day') g
  ),
  occ as (
    select v.class_id, days.d, v.title, v.level_label, v.duration_min, v.capacity,
           c.kind,
           coalesce(o.teacher_region, v.teacher_region) as teacher_region,
           coalesce(o.teacher_id, v.teacher_id) as teacher_id,
           (o.teacher_id is not null) as teacher_changed,
           coalesce(o.meeting_url, v.meeting_url) as meeting_url,
           (coalesce(o.moved_date, days.d) + coalesce(o.moved_time, v.start_time)) at time zone 'America/New_York' as s,
           (days.d + v.start_time) at time zone 'America/New_York' as original_s,
           (o.moved_date is not null) as rescheduled,
           lessons.is_cancelled(v.class_id, days.d) as cancelled,
           o.cancel_reason
    from days
    join lessons.class_versions v
      on v.valid_from <= days.d and (v.valid_until is null or days.d < v.valid_until)
     and v.weekday = extract(isodow from days.d)::int
    join lessons.classes c on c.id = v.class_id
    left join lessons.occurrence_overrides o on o.class_id = v.class_id and o.ny_date = days.d
  ),
  mine as (select * from lessons.attended(p_region, p_user_id, p_from, p_to)),
  mine_all as (select * from lessons.attended_x(p_region, p_user_id, p_from, p_to, true))
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'class_id', occ.class_id,
      'ny_date', occ.d,
      'starts_at', occ.s,
      'ends_at', occ.s + make_interval(mins => occ.duration_min),
      'original_starts_at', case when occ.rescheduled then occ.original_s end,
      'kind', occ.kind,
      'title', occ.title,
      'level_label', occ.level_label,
      'teacher', jsonb_build_object('region', occ.teacher_region, 'user_id', occ.teacher_id),
      'teacher_changed', occ.teacher_changed,
      'capacity', occ.capacity,
      'taken', case when occ.cancelled then 0 else lessons.seats_taken(occ.class_id, occ.d) end,
      'cancelled', occ.cancelled,
      'cancel_reason', case when occ.cancelled then occ.cancel_reason end,
      'mine', mine.source,
      'was_mine', (occ.cancelled and mine_all.class_id is not null),
      'moved_to', case when mv.id is not null then jsonb_build_object('class_id', mv.to_class, 'ny_date', mv.to_date) end,
      'attendance', att.status,
      'meeting_url', case when mine.source is not null then occ.meeting_url end
    ) order by occ.s, occ.class_id), '[]'::jsonb)
  into v_occ
  from occ
  left join mine on mine.class_id = occ.class_id and mine.ny_date = occ.d
  left join mine_all on mine_all.class_id = occ.class_id and mine_all.ny_date = occ.d
  left join lessons.moves mv
    on mv.region = p_region and mv.user_id = p_user_id and mv.from_class = occ.class_id and mv.from_date = occ.d
  left join lessons.attendance att
    on att.class_id = occ.class_id and att.ny_date = occ.d and att.region = p_region and att.user_id = p_user_id
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

-- ===========================================================================================
-- Student access: notifies when it is granted, taken away or given an end date
-- ===========================================================================================

create or replace function public.lesson_admin_set_student(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_region text, p_user_id uuid, p_tz text, p_target_is_teacher boolean,
  p_access boolean, p_access_until timestamptz, p_can_move boolean, p_weekly_quota int)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  c uuid;
  old lessons.students;
  v_now timestamptz := lessons.now();
  v_had boolean;
  v_has boolean;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  if p_target_is_teacher and p_access then
    perform lessons.fail('teacher_cannot_be_student');
  end if;
  if p_weekly_quota not between 1 and 7 then
    perform lessons.fail('invalid_quota');
  end if;
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);

  select * into old from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  v_had := lessons.has_access(old.access, old.access_until, v_now);

  update lessons.students s
  set access = p_access, access_until = p_access_until, can_move = p_can_move, weekly_quota = p_weekly_quota, updated_at = now()
  where s.region = p_region and s.user_id = p_user_id;

  for c in
    select e.class_id from lessons.enrollments e where e.region = p_region and e.user_id = p_user_id
    union select m.to_class from lessons.moves m where m.region = p_region and m.user_id = p_user_id
  loop
    perform lessons.assert_capacity(c, lessons.ny_today());
  end loop;

  v_has := lessons.has_access(p_access, p_access_until, v_now);
  if v_has and not v_had then
    perform lessons.notify(p_region, p_user_id, 'access_granted', 'acc:granted:' || lessons.stamp(),
      'Lessons are open for you',
      'Your teacher turned on lesson booking for your account. Pick your weekly class on the Lessons page.',
      '{}'::jsonb);
  elsif v_had and not v_has then
    perform lessons.notify(p_region, p_user_id, 'access_ended', 'acc:ended:' || lessons.stamp(),
      'Lesson booking is off',
      'Lesson booking was turned off for your account. Your seats were released. Talk to your teacher if this is a surprise.',
      '{}'::jsonb);
  elsif v_has and p_access_until is not null and p_access_until is distinct from old.access_until then
    perform lessons.notify(p_region, p_user_id, 'access_ending', 'acc:ending:' || lessons.stamp(),
      'Your lesson access has an end date',
      format('You can keep your lessons until %s.', to_char(p_access_until at time zone 'UTC', 'FMDD FMMon YYYY')),
      jsonb_build_object('access_until', p_access_until));
  end if;

  perform lessons.log(p_actor_region, p_actor_id, 'set_student', jsonb_build_object(
    'region', p_region, 'user_id', p_user_id, 'access', p_access, 'access_until', p_access_until,
    'can_move', p_can_move, 'weekly_quota', p_weekly_quota));
  return jsonb_build_object('region', p_region, 'user_id', p_user_id);
end;
$$;

-- ===========================================================================================
-- Template edits: overrides that no longer point at an occurrence go away, and the students are told
-- ===========================================================================================

create or replace function public.lesson_admin_update_class(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_class_id uuid, p_effective_from date, p_mode text, p_changes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_today date := lessons.ny_today();
  b lessons.class_versions;
  v_final_until date;
  v_new_class uuid;
  v_affected jsonb;
  v_dropped_moves int := 0;
  nv lessons.class_versions;
  r record;
  v_title text;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role, true);
  if p_mode not in ('follow', 'release', 'end') then
    perform lessons.fail('invalid_request');
  end if;
  if p_effective_from < v_today then
    perform lessons.fail('date_in_past');
  end if;
  if (select c.kind from lessons.classes c where c.id = p_class_id) = 'one_off' then
    perform lessons.fail('one_off_class');
  end if;

  select * into b from lessons.class_versions v
  where v.class_id = p_class_id and v.valid_from <= p_effective_from and (v.valid_until is null or p_effective_from < v.valid_until);
  if not found then
    perform lessons.fail('class_not_found');
  end if;
  v_title := b.title;

  -- Who is affected (for notifications): everyone attending this class from the effective date on.
  select coalesce(jsonb_agg(distinct jsonb_build_object('region', x.region, 'user_id', x.user_id)), '[]'::jsonb) into v_affected
  from (
    select e.region, e.user_id from lessons.enrollments e
    where e.class_id = p_class_id and (e.to_date is null or e.to_date > p_effective_from)
    union
    select m.region, m.user_id from lessons.moves m where m.to_class = p_class_id and m.to_date >= p_effective_from
  ) x;

  -- Where the class ends today: null when its last version is open-ended.
  select case when bool_or(v.valid_until is null) then null else max(v.valid_until) end
  into v_final_until
  from lessons.class_versions v where v.class_id = p_class_id;

  if p_mode in ('release', 'end') then
    -- Enrollments end on the effective date; ones that never started are removed.
    delete from lessons.enrollments e where e.class_id = p_class_id and e.from_date >= p_effective_from;
    update lessons.enrollments e set to_date = p_effective_from
    where e.class_id = p_class_id and (e.to_date is null or e.to_date > p_effective_from);
    delete from lessons.extras x where x.class_id = p_class_id and x.from_date >= p_effective_from;
    update lessons.extras x set to_date = p_effective_from
    where x.class_id = p_class_id and (x.to_date is null or x.to_date > p_effective_from);
    -- One-week moves into the class after that date disappear; a vacated occurrence is a plain extra lesson now.
    delete from lessons.moves m where m.to_class = p_class_id and m.to_date >= p_effective_from;
    get diagnostics v_dropped_moves = row_count;
    update lessons.moves m set from_class = null, from_date = null
    where m.from_class = p_class_id and m.from_date >= p_effective_from;
    delete from lessons.occurrence_overrides o where o.class_id = p_class_id and o.ny_date >= p_effective_from;
    delete from lessons.class_versions v where v.class_id = p_class_id and v.valid_from > p_effective_from;
    if b.valid_from = p_effective_from then
      delete from lessons.class_versions v where v.id = b.id;
    else
      update lessons.class_versions v set valid_until = p_effective_from where v.id = b.id;
    end if;
  end if;

  if p_mode = 'end' then
    for r in select * from jsonb_to_recordset(v_affected) as x(region text, user_id uuid) loop
      perform lessons.notify(r.region, r.user_id, 'class_ended', 'end:' || p_class_id || ':' || p_effective_from,
        'A class you are in is ending',
        format('%s ends on %s. Your seat is released from then. You can pick another class on the Lessons page.',
               v_title, to_char(p_effective_from, 'FMDD FMMon YYYY')),
        jsonb_build_object('class_id', p_class_id, 'effective_from', p_effective_from));
    end loop;
    perform lessons.log(p_actor_region, p_actor_id, 'end_class', jsonb_build_object(
      'class_id', p_class_id, 'effective_from', p_effective_from));
    return jsonb_build_object('class_id', p_class_id, 'affected', v_affected, 'dropped_moves', v_dropped_moves);
  end if;

  nv := b;
  nv.id := gen_random_uuid();
  nv.valid_from := p_effective_from;
  nv.valid_until := v_final_until;
  nv.created_at := now();
  if p_changes ? 'weekday' then nv.weekday := (p_changes->>'weekday')::smallint; end if;
  if p_changes ? 'start_time' then nv.start_time := (p_changes->>'start_time')::time; end if;
  if p_changes ? 'duration_min' then nv.duration_min := (p_changes->>'duration_min')::smallint; end if;
  if p_changes ? 'capacity' then nv.capacity := (p_changes->>'capacity')::smallint; end if;
  if p_changes ? 'title' then nv.title := p_changes->>'title'; end if;
  if p_changes ? 'level_label' then nv.level_label := p_changes->>'level_label'; end if;
  if p_changes ? 'meeting_url' then nv.meeting_url := p_changes->>'meeting_url'; end if;
  if p_changes ? 'teacher_region' then nv.teacher_region := p_changes->>'teacher_region'; end if;
  if p_changes ? 'teacher_id' then nv.teacher_id := (p_changes->>'teacher_id')::uuid; end if;

  if p_mode = 'follow' then
    delete from lessons.class_versions v where v.class_id = p_class_id and v.valid_from > p_effective_from;
    if b.valid_from = p_effective_from then
      delete from lessons.class_versions v where v.id = b.id;
    else
      update lessons.class_versions v set valid_until = p_effective_from where v.id = b.id;
    end if;
    v_new_class := p_class_id;
  else
    insert into lessons.classes default values returning id into v_new_class;
    nv.class_id := v_new_class;
    nv.valid_until := null;
  end if;

  insert into lessons.class_versions (id, class_id, valid_from, valid_until, weekday, start_time, duration_min, capacity,
                                      title, level_label, meeting_url, teacher_region, teacher_id, created_at)
  values (nv.id, nv.class_id, nv.valid_from, nv.valid_until, nv.weekday, nv.start_time, nv.duration_min, nv.capacity,
          nv.title, nv.level_label, nv.meeting_url, nv.teacher_region, nv.teacher_id, nv.created_at);

  if p_mode = 'follow' then
    -- Exceptions and one-week moves that pointed at dates which are not occurrences any more (the weekday changed).
    delete from lessons.occurrence_overrides o
    where o.class_id = p_class_id and o.ny_date >= p_effective_from
      and not exists (select 1 from lessons.version_at(o.class_id, o.ny_date));
    delete from lessons.moves m
    where m.to_class = p_class_id and m.to_date >= p_effective_from
      and not exists (select 1 from lessons.version_at(m.to_class, m.to_date));
    get diagnostics v_dropped_moves = row_count;
    update lessons.moves m set from_class = null, from_date = null
    where m.from_class = p_class_id and m.from_date >= p_effective_from
      and not exists (select 1 from lessons.version_at(m.from_class, m.from_date));
    -- A smaller capacity must still hold the seats already taken.
    perform lessons.assert_capacity(p_class_id, p_effective_from);

    for r in select * from jsonb_to_recordset(v_affected) as x(region text, user_id uuid) loop
      perform lessons.notify(r.region, r.user_id, 'class_updated', 'upd:' || p_class_id || ':' || p_effective_from || ':' || lessons.stamp(),
        'Your class changed',
        format('%s changes from %s. Check your lessons on the Lessons page.', nv.title, to_char(p_effective_from, 'FMDD FMMon YYYY')),
        jsonb_build_object('class_id', p_class_id, 'effective_from', p_effective_from));
    end loop;
  else
    for r in select * from jsonb_to_recordset(v_affected) as x(region text, user_id uuid) loop
      perform lessons.notify(r.region, r.user_id, 'class_replaced', 'rel:' || p_class_id || ':' || p_effective_from,
        'Your class is being replaced',
        format('%s is replaced by a new class from %s. Your seat in the old one is released, so please pick a class again on the Lessons page.',
               v_title, to_char(p_effective_from, 'FMDD FMMon YYYY')),
        jsonb_build_object('class_id', p_class_id, 'new_class_id', v_new_class, 'effective_from', p_effective_from));
    end loop;
  end if;

  perform lessons.log(p_actor_region, p_actor_id, 'update_class', jsonb_build_object(
    'class_id', p_class_id, 'new_class_id', v_new_class, 'mode', p_mode, 'effective_from', p_effective_from,
    'changes', p_changes));
  return jsonb_build_object('class_id', v_new_class, 'affected', v_affected, 'dropped_moves', v_dropped_moves);
end;
$$;

-- ===========================================================================================
-- Exceptions on one lesson
-- ===========================================================================================

-- Cancels one lesson. Teachers may cancel their own; the students in it are told.
create function public.lesson_staff_cancel_occurrence(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r record;
  v_start timestamptz;
  v_title text;
  v_affected jsonb;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  v_start := lessons.occ_start_any(p_class_id, p_ny_date);
  if v_start <= lessons.now() then
    perform lessons.fail('too_late');
  end if;
  select v.title into v_title from lessons.version_at(p_class_id, p_ny_date) v;

  select coalesce(jsonb_agg(jsonb_build_object('region', a.region, 'user_id', a.user_id)), '[]'::jsonb) into v_affected
  from lessons.occ_attendees(p_class_id, p_ny_date) a;

  insert into lessons.occurrence_overrides (class_id, ny_date, cancelled, cancel_reason, updated_by_region, updated_by_id)
  values (p_class_id, p_ny_date, true, nullif(trim(p_reason), ''), p_actor_region, p_actor_id)
  on conflict (class_id, ny_date) do update
    set cancelled = true, cancel_reason = excluded.cancel_reason,
        updated_by_region = excluded.updated_by_region, updated_by_id = excluded.updated_by_id, updated_at = now();

  for r in select * from lessons.occ_attendees(p_class_id, p_ny_date) loop
    perform lessons.notify(r.region, r.user_id, 'class_cancelled', 'cancel:' || p_class_id || ':' || p_ny_date,
      'Lesson cancelled',
      format('%s on %s was cancelled%s. You can pick another class that week.',
             v_title, lessons.fmt_local(v_start, r.region, r.user_id),
             case when nullif(trim(p_reason), '') is null then '' else ' (' || trim(p_reason) || ')' end),
      jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date, 'starts_at', v_start));
  end loop;

  perform lessons.log(p_actor_region, p_actor_id, 'cancel_occurrence', jsonb_build_object(
    'class_id', p_class_id, 'ny_date', p_ny_date, 'reason', p_reason));
  return jsonb_build_object('affected', v_affected);
end;
$$;

create function public.lesson_staff_restore_occurrence(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r record;
  v_start timestamptz;
  v_title text;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  v_start := lessons.occ_start_any(p_class_id, p_ny_date);
  if v_start <= lessons.now() then
    perform lessons.fail('too_late');
  end if;
  select v.title into v_title from lessons.version_at(p_class_id, p_ny_date) v;

  update lessons.occurrence_overrides o set cancelled = false, cancel_reason = null,
    updated_by_region = p_actor_region, updated_by_id = p_actor_id, updated_at = now()
  where o.class_id = p_class_id and o.ny_date = p_ny_date;

  if not lessons.is_cancelled(p_class_id, p_ny_date) then
    for r in select * from lessons.occ_attendees(p_class_id, p_ny_date) loop
      perform lessons.notify(r.region, r.user_id, 'class_restored', 'restore:' || p_class_id || ':' || p_ny_date || ':' || lessons.stamp(),
        'Lesson is back on',
        format('%s on %s is happening after all.', v_title, lessons.fmt_local(v_start, r.region, r.user_id)),
        jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date, 'starts_at', v_start));
    end loop;
  end if;
  perform lessons.log(p_actor_region, p_actor_id, 'restore_occurrence', jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date));
  return jsonb_build_object('still_cancelled', lessons.is_cancelled(p_class_id, p_ny_date));
end;
$$;

-- Moves one lesson to another day/time (at most 6 days from its template date); null date puts it back.
-- Returns the students whose OTHER lessons now overlap it, as a warning.
create function public.lesson_staff_move_occurrence(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date, p_new_date date, p_new_time time)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r record;
  v_old_start timestamptz;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_title text;
  v_conflicts jsonb;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  if lessons.is_cancelled(p_class_id, p_ny_date) then
    perform lessons.fail('cancelled');
  end if;
  v_old_start := lessons.occ_start_any(p_class_id, p_ny_date);
  if v_old_start <= lessons.now() then
    perform lessons.fail('too_late');
  end if;
  if (p_new_date is null) <> (p_new_time is null) then
    perform lessons.fail('invalid_request');
  end if;
  if p_new_date is not null and abs(p_new_date - p_ny_date) > 6 then
    perform lessons.fail('invalid_date');
  end if;
  select v.title into v_title from lessons.version_at(p_class_id, p_ny_date) v;

  insert into lessons.occurrence_overrides (class_id, ny_date, moved_date, moved_time, updated_by_region, updated_by_id)
  values (p_class_id, p_ny_date, p_new_date, p_new_time, p_actor_region, p_actor_id)
  on conflict (class_id, ny_date) do update
    set moved_date = excluded.moved_date, moved_time = excluded.moved_time,
        updated_by_region = excluded.updated_by_region, updated_by_id = excluded.updated_by_id, updated_at = now();

  v_new_start := lessons.occ_start_any(p_class_id, p_ny_date);
  v_new_end := lessons.occ_end_any(p_class_id, p_ny_date);
  if v_new_start <= lessons.now() then
    perform lessons.fail('too_late');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('region', a.region, 'user_id', a.user_id)), '[]'::jsonb) into v_conflicts
  from lessons.occ_attendees(p_class_id, p_ny_date) a
  where exists (
    select 1 from lessons.attended(a.region, a.user_id, v_new_start - interval '1 day', v_new_end) o
    where not (o.class_id = p_class_id and o.ny_date = p_ny_date) and o.starts_at < v_new_end and v_new_start < o.ends_at);

  for r in select * from lessons.occ_attendees(p_class_id, p_ny_date) loop
    perform lessons.notify(r.region, r.user_id, 'class_moved',
      'move:' || p_class_id || ':' || p_ny_date || ':' || lessons.stamp(),
      'Lesson moved',
      format('%s moved from %s to %s. If the new time does not work for you, you can pick another class that week.',
             v_title, lessons.fmt_local(v_old_start, r.region, r.user_id), lessons.fmt_local(v_new_start, r.region, r.user_id)),
      jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date, 'old_starts_at', v_old_start, 'starts_at', v_new_start));
  end loop;

  perform lessons.log(p_actor_region, p_actor_id, 'move_occurrence', jsonb_build_object(
    'class_id', p_class_id, 'ny_date', p_ny_date, 'new_date', p_new_date, 'new_time', p_new_time));
  return jsonb_build_object('starts_at', v_new_start, 'conflicts', v_conflicts);
end;
$$;

-- A substitute teacher for one lesson (admin only); null puts the regular teacher back. The Worker has
-- checked that the substitute really is a teacher, and passes their name for the message.
create function public.lesson_staff_set_substitute(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date,
  p_teacher_region text, p_teacher_id uuid, p_teacher_name text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r record;
  v_start timestamptz;
  v_title text;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role, true);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  if (p_teacher_region is null) <> (p_teacher_id is null) then
    perform lessons.fail('invalid_request');
  end if;
  v_start := lessons.occ_start_any(p_class_id, p_ny_date);
  if v_start <= lessons.now() then
    perform lessons.fail('too_late');
  end if;
  select v.title into v_title from lessons.version_at(p_class_id, p_ny_date) v;

  insert into lessons.occurrence_overrides (class_id, ny_date, teacher_region, teacher_id, updated_by_region, updated_by_id)
  values (p_class_id, p_ny_date, p_teacher_region, p_teacher_id, p_actor_region, p_actor_id)
  on conflict (class_id, ny_date) do update
    set teacher_region = excluded.teacher_region, teacher_id = excluded.teacher_id,
        updated_by_region = excluded.updated_by_region, updated_by_id = excluded.updated_by_id, updated_at = now();

  for r in select * from lessons.occ_attendees(p_class_id, p_ny_date) loop
    perform lessons.notify(r.region, r.user_id, 'teacher_changed',
      'teacher:' || p_class_id || ':' || p_ny_date || ':' || lessons.stamp(),
      'Different teacher for your lesson',
      format('%s on %s %s.', v_title, lessons.fmt_local(v_start, r.region, r.user_id),
             case when p_teacher_id is null then 'is back with the usual teacher'
                  else 'will be taught by ' || coalesce(nullif(trim(p_teacher_name), ''), 'a substitute teacher') end),
      jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date, 'starts_at', v_start));
  end loop;

  perform lessons.log(p_actor_region, p_actor_id, 'set_substitute', jsonb_build_object(
    'class_id', p_class_id, 'ny_date', p_ny_date, 'teacher_region', p_teacher_region, 'teacher_id', p_teacher_id));
  return jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date);
end;
$$;

create function public.lesson_staff_set_meeting_url(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date, p_url text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  insert into lessons.occurrence_overrides (class_id, ny_date, meeting_url, updated_by_region, updated_by_id)
  values (p_class_id, p_ny_date, nullif(trim(p_url), ''), p_actor_region, p_actor_id)
  on conflict (class_id, ny_date) do update
    set meeting_url = excluded.meeting_url,
        updated_by_region = excluded.updated_by_region, updated_by_id = excluded.updated_by_id, updated_at = now();
  perform lessons.log(p_actor_region, p_actor_id, 'set_meeting_url', jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date));
  return jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date);
end;
$$;

-- A lesson that happens once: a class with a single date. Students join it with a one-week move.
create function public.lesson_admin_create_oneoff(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_teacher_region text, p_teacher_id uuid, p_ny_date date, p_start_time time, p_duration_min int, p_capacity int,
  p_title text, p_level_label text, p_meeting_url text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_class uuid;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role, true);
  if (p_ny_date + p_start_time) at time zone 'America/New_York' <= lessons.now() then
    perform lessons.fail('date_in_past');
  end if;
  insert into lessons.classes (kind) values ('one_off') returning id into v_class;
  insert into lessons.class_versions (class_id, valid_from, valid_until, weekday, start_time, duration_min, capacity, title,
                                      level_label, meeting_url, teacher_region, teacher_id)
  values (v_class, p_ny_date, p_ny_date + 1, extract(isodow from p_ny_date)::int, p_start_time, p_duration_min, p_capacity,
          p_title, p_level_label, p_meeting_url, p_teacher_region, p_teacher_id);
  perform lessons.log(p_actor_region, p_actor_id, 'create_oneoff', jsonb_build_object('class_id', v_class, 'ny_date', p_ny_date));
  return jsonb_build_object('class_id', v_class);
end;
$$;

-- ===========================================================================================
-- Vacations
-- ===========================================================================================

create function public.lesson_admin_add_vacation(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_scope text, p_teacher_region text, p_teacher_id uuid, p_from_date date, p_to_date date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_id bigint;
  r record;
  v_affected jsonb;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role, true);
  if p_to_date < lessons.ny_today() then
    perform lessons.fail('date_in_past');
  end if;
  insert into lessons.vacations (scope, teacher_region, teacher_id, from_date, to_date, reason, created_by_region, created_by_id)
  values (p_scope, p_teacher_region, p_teacher_id, p_from_date, p_to_date, nullif(trim(p_reason), ''), p_actor_region, p_actor_id)
  returning id into v_id;

  -- Every student who has a future lesson inside the vacation hears about it once.
  with hit as (
    select a.region, a.user_id, min(lessons.occ_start_any(oc.class_id, oc.d)) as first_start
    from (
      select v.class_id, g::date as d
      from generate_series((p_from_date - 7)::timestamp, (p_to_date + 7)::timestamp, interval '1 day') g
      join lessons.class_versions v
        on v.valid_from <= g::date and (v.valid_until is null or g::date < v.valid_until)
       and v.weekday = extract(isodow from g::date)::int
    ) oc
    cross join lateral lessons.occ_attendees(oc.class_id, oc.d) a
    where lessons.occ_eff_date(oc.class_id, oc.d) between p_from_date and p_to_date
      and lessons.is_cancelled(oc.class_id, oc.d)
      and lessons.occ_start_any(oc.class_id, oc.d) > lessons.now()
      and (p_scope = 'global' or exists (select 1 from lessons.effective_teacher(oc.class_id, oc.d) t
                                         where t.teacher_region = p_teacher_region and t.teacher_id = p_teacher_id))
    group by a.region, a.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('region', region, 'user_id', user_id, 'first_start', first_start)), '[]'::jsonb)
  into v_affected from hit;

  for r in select * from jsonb_to_recordset(v_affected) as x(region text, user_id uuid, first_start timestamptz) loop
    perform lessons.notify(r.region, r.user_id, 'vacation', 'vac:' || v_id,
      'No lessons for a while',
      format('There are no lessons from %s to %s%s. Your lessons in that time are cancelled; they come back after.',
             to_char(p_from_date, 'FMDD FMMon'), to_char(p_to_date, 'FMDD FMMon'),
             case when nullif(trim(p_reason), '') is null then '' else ' (' || trim(p_reason) || ')' end),
      jsonb_build_object('vacation_id', v_id, 'from_date', p_from_date, 'to_date', p_to_date));
  end loop;

  perform lessons.log(p_actor_region, p_actor_id, 'add_vacation', jsonb_build_object(
    'id', v_id, 'scope', p_scope, 'teacher_id', p_teacher_id, 'from_date', p_from_date, 'to_date', p_to_date));
  return jsonb_build_object('id', v_id, 'affected', v_affected);
end;
$$;

create function public.lesson_admin_delete_vacation(p_actor_region text, p_actor_id uuid, p_actor_role text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v lessons.vacations;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role, true);
  select * into v from lessons.vacations where id = p_id;
  if not found then
    perform lessons.fail('not_found');
  end if;
  delete from lessons.vacations where id = p_id;
  perform lessons.log(p_actor_region, p_actor_id, 'delete_vacation', jsonb_build_object('id', p_id));
  return jsonb_build_object('id', p_id);
end;
$$;

-- ===========================================================================================
-- Staff acting for a student
-- ===========================================================================================

create function public.lesson_staff_enroll(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_region text, p_user_id uuid, p_tz text, p_target_is_teacher boolean, p_class_id uuid, p_replace_class_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
  v_title text;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_class(p_actor_region, p_actor_id, p_actor_role, p_class_id);
  if p_target_is_teacher then
    perform lessons.fail('teacher_cannot_be_student');
  end if;
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.enroll_impl(p_region, p_user_id, p_class_id, p_replace_class_id, true);
  select v.title into v_title from lessons.version_at(p_class_id, (r->>'from_date')::date) v;
  perform lessons.notify(p_region, p_user_id, 'enrolled_by_teacher', 'enr:' || p_class_id || ':' || (r->>'from_date'),
    'You were added to a class',
    format('Your teacher added you to %s, every week from %s.', coalesce(v_title, 'a class'),
           to_char((r->>'from_date')::date, 'FMDD FMMon YYYY')),
    jsonb_build_object('class_id', p_class_id));
  perform lessons.log(p_actor_region, p_actor_id, 'staff_enroll', r || jsonb_build_object('region', p_region, 'user_id', p_user_id));
  return r;
end;
$$;

create function public.lesson_staff_unenroll(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_region text, p_user_id uuid, p_tz text, p_class_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
  v_title text;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_class(p_actor_region, p_actor_id, p_actor_role, p_class_id);
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.unenroll_impl(p_region, p_user_id, p_class_id, true);
  select v.title into v_title from lessons.class_versions v where v.class_id = p_class_id order by v.valid_from desc limit 1;
  perform lessons.notify(p_region, p_user_id, 'removed_by_teacher', 'rem:' || p_class_id || ':' || (r->>'to_date'),
    'You were removed from a class',
    format('Your teacher removed you from %s from %s.', coalesce(v_title, 'a class'), to_char((r->>'to_date')::date, 'FMDD FMMon YYYY')),
    jsonb_build_object('class_id', p_class_id));
  perform lessons.log(p_actor_region, p_actor_id, 'staff_unenroll', r || jsonb_build_object('region', p_region, 'user_id', p_user_id));
  return r;
end;
$$;

create function public.lesson_staff_move_once(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_region text, p_user_id uuid, p_tz text, p_target_is_teacher boolean,
  p_to_class uuid, p_to_date date, p_from_class uuid default null, p_from_date date default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_to_class, p_to_date);
  if p_target_is_teacher then
    perform lessons.fail('teacher_cannot_be_student');
  end if;
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.move_once_impl(p_region, p_user_id, p_to_class, p_to_date, p_from_class, p_from_date, true);
  perform lessons.log(p_actor_region, p_actor_id, 'staff_move_once', r || jsonb_build_object('region', p_region, 'user_id', p_user_id));
  return r;
end;
$$;

create function public.lesson_staff_unmove(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_region text, p_user_id uuid, p_tz text, p_to_class uuid, p_to_date date)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r jsonb;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_to_class, p_to_date);
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  r := lessons.unmove_impl(p_region, p_user_id, p_to_class, p_to_date, true);
  perform lessons.log(p_actor_region, p_actor_id, 'staff_unmove', r || jsonb_build_object('region', p_region, 'user_id', p_user_id));
  return r;
end;
$$;

-- An extra attendee: over capacity, over quota, over a time conflict -- the teacher's call, with a reason.
-- p_to_date null = every lesson of the class from p_from_date on. The student needs access.
create function public.lesson_staff_add_extra(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_region text, p_user_id uuid, p_tz text, p_target_is_teacher boolean,
  p_class_id uuid, p_from_date date, p_to_date date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  st lessons.students;
  v_id bigint;
  d date;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_class(p_actor_region, p_actor_id, p_actor_role, p_class_id);
  if p_target_is_teacher then
    perform lessons.fail('teacher_cannot_be_student');
  end if;
  if nullif(trim(p_reason), '') is null then
    perform lessons.fail('reason_required');
  end if;
  if p_to_date is not null and p_to_date <= p_from_date then
    perform lessons.fail('invalid_request');
  end if;
  if p_from_date < lessons.ny_today() then
    perform lessons.fail('date_in_past');
  end if;
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  if not lessons.has_access(st.access, st.access_until, lessons.now()) then
    perform lessons.fail('no_access');
  end if;
  -- Already in the lesson some other way: nothing to add.
  for d in select g::date from generate_series(p_from_date::timestamp, coalesce(p_to_date - 1, p_from_date + 60)::timestamp, interval '1 day') g loop
    if exists (select 1 from lessons.occ_attendees(p_class_id, d) a where a.region = p_region and a.user_id = p_user_id) then
      perform lessons.fail('already_attending', d::text);
    end if;
  end loop;
  insert into lessons.extras (region, user_id, class_id, from_date, to_date, reason, added_by_region, added_by_id)
  values (p_region, p_user_id, p_class_id, p_from_date, p_to_date, trim(p_reason), p_actor_region, p_actor_id)
  returning id into v_id;
  perform lessons.notify(p_region, p_user_id, 'added_extra', 'extra:' || v_id,
    'You were added to a lesson',
    format('Your teacher added you to %s from %s.', coalesce((select v.title from lessons.version_at(p_class_id, p_from_date) v), 'a class'),
           to_char(p_from_date, 'FMDD FMMon YYYY')),
    jsonb_build_object('class_id', p_class_id, 'extra_id', v_id));
  perform lessons.log(p_actor_region, p_actor_id, 'add_extra', jsonb_build_object(
    'id', v_id, 'region', p_region, 'user_id', p_user_id, 'class_id', p_class_id, 'from_date', p_from_date, 'to_date', p_to_date, 'reason', p_reason));
  return jsonb_build_object('id', v_id);
end;
$$;

create function public.lesson_staff_remove_extra(p_actor_region text, p_actor_id uuid, p_actor_role text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  x lessons.extras;
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  select * into x from lessons.extras where id = p_id;
  if not found then
    perform lessons.fail('not_found');
  end if;
  perform lessons.assert_manage_class(p_actor_region, p_actor_id, p_actor_role, x.class_id);
  delete from lessons.extras where id = p_id;
  perform lessons.log(p_actor_region, p_actor_id, 'remove_extra', jsonb_build_object('id', p_id, 'region', x.region, 'user_id', x.user_id));
  return jsonb_build_object('id', p_id);
end;
$$;

-- Attendance: after the lesson has started, for someone who was in it. A null status clears the mark.
create function public.lesson_staff_mark_attendance(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_class_id uuid, p_ny_date date,
  p_region text, p_user_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  perform lessons.require_role(p_actor_role);
  perform lessons.assert_manage_occurrence(p_actor_region, p_actor_id, p_actor_role, p_class_id, p_ny_date);
  if p_status is not null and p_status not in ('present', 'absent') then
    perform lessons.fail('invalid_request');
  end if;
  if lessons.is_cancelled(p_class_id, p_ny_date) then
    perform lessons.fail('cancelled');
  end if;
  if lessons.occ_start_any(p_class_id, p_ny_date) > lessons.now() then
    perform lessons.fail('too_early');
  end if;
  if not exists (select 1 from lessons.occ_attendees(p_class_id, p_ny_date) a where a.region = p_region and a.user_id = p_user_id) then
    perform lessons.fail('not_attending');
  end if;
  if p_status is null then
    delete from lessons.attendance a
    where a.class_id = p_class_id and a.ny_date = p_ny_date and a.region = p_region and a.user_id = p_user_id;
  else
    insert into lessons.attendance (class_id, ny_date, region, user_id, status, marked_by_region, marked_by_id)
    values (p_class_id, p_ny_date, p_region, p_user_id, p_status, p_actor_region, p_actor_id)
    on conflict (class_id, ny_date, region, user_id) do update
      set status = excluded.status, marked_by_region = excluded.marked_by_region, marked_by_id = excluded.marked_by_id, marked_at = now();
  end if;
  return jsonb_build_object('class_id', p_class_id, 'ny_date', p_ny_date, 'status', p_status);
end;
$$;

-- ===========================================================================================
-- What the panel reads
-- ===========================================================================================

-- Classes (with their versions and fixed students), every lesson that STARTS in [p_from, p_to) with its
-- attendees, and the vacations. A teacher gets only their own classes and lessons.
create function public.lesson_staff_get_overview(
  p_actor_region text, p_actor_id uuid, p_actor_role text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_classes jsonb;
  v_occ jsonb;
  v_vac jsonb;
  v_today date := lessons.ny_today();
begin
  perform lessons.require_role(p_actor_role);
  if p_to <= p_from or p_to - p_from > interval '124 days' then
    perform lessons.fail('invalid_range');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'class_id', c.id,
      'kind', c.kind,
      'versions', (
        select jsonb_agg(jsonb_build_object(
            'id', v.id, 'valid_from', v.valid_from, 'valid_until', v.valid_until, 'weekday', v.weekday,
            'start_time', v.start_time, 'duration_min', v.duration_min, 'capacity', v.capacity, 'title', v.title,
            'level_label', v.level_label, 'meeting_url', v.meeting_url,
            'teacher', jsonb_build_object('region', v.teacher_region, 'user_id', v.teacher_id)) order by v.valid_from)
        from lessons.class_versions v
        where v.class_id = c.id and (v.valid_until is null or v.valid_until > v_today)),
      'fixed', (
        select coalesce(jsonb_agg(jsonb_build_object('region', e.region, 'user_id', e.user_id) order by e.created_at), '[]'::jsonb)
        from lessons.enrollments e where e.class_id = c.id and lessons.is_open(e.class_id, e.to_date)),
      'extras', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'region', x.region, 'user_id', x.user_id, 'from_date', x.from_date,
                                                      'to_date', x.to_date, 'reason', x.reason) order by x.id), '[]'::jsonb)
        from lessons.extras x where x.class_id = c.id and (x.to_date is null or x.to_date > v_today))
    ) order by c.created_at), '[]'::jsonb)
  into v_classes
  from lessons.classes c
  where exists (
    select 1 from lessons.class_versions v
    where v.class_id = c.id and (v.valid_until is null or v.valid_until > v_today)
      and (p_actor_role = 'admin' or (v.teacher_region = p_actor_region and v.teacher_id = p_actor_id)));

  with days as (
    select g::date as d from generate_series(
      ((p_from at time zone 'America/New_York')::date - 8)::timestamp,
      ((p_to at time zone 'America/New_York')::date + 8)::timestamp,
      interval '1 day') g
  ),
  occ as (
    select v.class_id, days.d, v.title, v.level_label, v.duration_min, v.capacity, c.kind,
           coalesce(o.teacher_region, v.teacher_region) as teacher_region,
           coalesce(o.teacher_id, v.teacher_id) as teacher_id,
           v.teacher_region as regular_teacher_region, v.teacher_id as regular_teacher_id,
           coalesce(o.meeting_url, v.meeting_url) as meeting_url,
           (coalesce(o.moved_date, days.d) + coalesce(o.moved_time, v.start_time)) at time zone 'America/New_York' as s,
           (days.d + v.start_time) at time zone 'America/New_York' as original_s,
           (o.moved_date is not null) as rescheduled,
           lessons.is_cancelled(v.class_id, days.d) as cancelled,
           o.cancelled as cancelled_by_override,
           o.cancel_reason
    from days
    join lessons.class_versions v
      on v.valid_from <= days.d and (v.valid_until is null or days.d < v.valid_until)
     and v.weekday = extract(isodow from days.d)::int
    join lessons.classes c on c.id = v.class_id
    left join lessons.occurrence_overrides o on o.class_id = v.class_id and o.ny_date = days.d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'class_id', occ.class_id,
      'ny_date', occ.d,
      'starts_at', occ.s,
      'ends_at', occ.s + make_interval(mins => occ.duration_min),
      'original_starts_at', case when occ.rescheduled then occ.original_s end,
      'kind', occ.kind,
      'title', occ.title,
      'level_label', occ.level_label,
      'capacity', occ.capacity,
      'teacher', jsonb_build_object('region', occ.teacher_region, 'user_id', occ.teacher_id),
      'regular_teacher', jsonb_build_object('region', occ.regular_teacher_region, 'user_id', occ.regular_teacher_id),
      'meeting_url', occ.meeting_url,
      'cancelled', occ.cancelled,
      'cancelled_by_vacation', (occ.cancelled and not coalesce(occ.cancelled_by_override, false)),
      'cancel_reason', occ.cancel_reason,
      'taken', case when occ.cancelled then 0 else lessons.seats_taken(occ.class_id, occ.d) end,
      'attendees', (
        select coalesce(jsonb_agg(jsonb_build_object('region', a.region, 'user_id', a.user_id, 'source', a.source, 'attendance', a.attendance)
                                  order by a.source, a.user_id), '[]'::jsonb)
        from lessons.occ_attendees(occ.class_id, occ.d) a)
    ) order by occ.s, occ.class_id), '[]'::jsonb)
  into v_occ
  from occ
  where occ.s >= p_from and occ.s < p_to
    and (p_actor_role = 'admin' or (occ.teacher_region = p_actor_region and occ.teacher_id = p_actor_id));

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', vac.id, 'scope', vac.scope, 'teacher', case when vac.teacher_id is null then null
        else jsonb_build_object('region', vac.teacher_region, 'user_id', vac.teacher_id) end,
      'from_date', vac.from_date, 'to_date', vac.to_date, 'reason', vac.reason) order by vac.from_date), '[]'::jsonb)
  into v_vac
  from lessons.vacations vac
  where vac.to_date >= v_today - 7
    and (p_actor_role = 'admin' or vac.scope = 'global' or (vac.teacher_region = p_actor_region and vac.teacher_id = p_actor_id));

  return jsonb_build_object('classes', v_classes, 'occurrences', v_occ, 'vacations', v_vac);
end;
$$;

-- Everyone the writer knows, with the state of their access (the Worker adds names from the regions).
create function public.lesson_staff_list_students(p_actor_role text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
begin
  perform lessons.require_role(p_actor_role);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'region', s.region, 'user_id', s.user_id, 'access', s.access, 'access_until', s.access_until,
        'has_access', lessons.has_access(s.access, s.access_until, v_now),
        'can_move', s.can_move, 'weekly_quota', s.weekly_quota,
        'tz', (select c.tz from lessons.student_week_cfg c where c.region = s.region and c.user_id = s.user_id
               and c.effective_from <= v_now order by c.effective_from desc limit 1),
        'fixed', (select count(*) from lessons.enrollments e where e.region = s.region and e.user_id = s.user_id
                  and lessons.is_open(e.class_id, e.to_date))
      ) order by s.created_at)
    from lessons.students s), '[]'::jsonb);
end;
$$;

-- One student, for the panel: access, fixed classes, upcoming lessons, recent attendance.
create function public.lesson_staff_student_detail(p_actor_role text, p_region text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  s lessons.students;
  v_now timestamptz := lessons.now();
begin
  perform lessons.require_role(p_actor_role);
  select * into s from lessons.students x where x.region = p_region and x.user_id = p_user_id;
  if not found then
    return jsonb_build_object('known', false);
  end if;
  return jsonb_build_object(
    'known', true,
    'access', s.access, 'access_until', s.access_until, 'has_access', lessons.has_access(s.access, s.access_until, v_now),
    'can_move', s.can_move, 'weekly_quota', s.weekly_quota,
    'fixed', (
      select coalesce(jsonb_agg(jsonb_build_object('class_id', e.class_id, 'title', ver.title, 'from_date', e.from_date,
                                                    'next_starts_at', (nd.d + ver.start_time) at time zone 'America/New_York')), '[]'::jsonb)
      from lessons.enrollments e
      cross join lateral (select lessons.next_occ(e.class_id, v_now) as d) nd
      join lateral lessons.version_at(e.class_id, nd.d) ver on true
      where e.region = p_region and e.user_id = p_user_id and nd.d is not null and lessons.is_open(e.class_id, e.to_date)),
    'upcoming', (
      select coalesce(jsonb_agg(jsonb_build_object('class_id', a.class_id, 'ny_date', a.ny_date, 'starts_at', a.starts_at,
                                                    'source', a.source,
                                                    'title', (select v.title from lessons.version_at(a.class_id, a.ny_date) v)) order by a.starts_at), '[]'::jsonb)
      from lessons.attended(p_region, p_user_id, v_now, v_now + interval '28 days') a),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('class_id', h.class_id, 'ny_date', h.ny_date, 'status', h.status,
                                                    'title', (select v.title from lessons.version_at(h.class_id, h.ny_date) v)) order by h.ny_date desc), '[]'::jsonb)
      from (select * from lessons.attendance t where t.region = p_region and t.user_id = p_user_id order by t.ny_date desc limit 20) h)
  );
end;
$$;

-- ===========================================================================================
-- Accounts that went away
-- ===========================================================================================

-- Every student the writer knows, so the Worker can check each against its own region's users table.
create function public.lesson_list_student_keys() returns jsonb
language sql stable security definer set search_path = pg_catalog, lessons
as $$
  select coalesce(jsonb_agg(jsonb_build_object('region', s.region, 'user_id', s.user_id)), '[]'::jsonb) from lessons.students s
$$;

-- p_hard = the account is gone (everything of theirs is deleted); otherwise it is only leaving (seats freed).
create function public.lesson_student_removed(p_region text, p_user_id uuid, p_hard boolean)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  if p_hard then
    delete from lessons.students where region = p_region and user_id = p_user_id;
  else
    update lessons.students set access = false, updated_at = now() where region = p_region and user_id = p_user_id;
    perform lessons.drop_future(p_region, p_user_id);
  end if;
  perform lessons.log(null, null, case when p_hard then 'student_deleted' else 'student_leaving' end,
    jsonb_build_object('region', p_region, 'user_id', p_user_id));
end;
$$;

-- ===========================================================================================
-- Grants: every public.lesson_* function is callable by service_role only.
-- ===========================================================================================

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

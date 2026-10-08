-- EU-new ONLY. The lesson booking "writer" (docs/LESSON_BOOKING_PLAN.md, stage 1): the single place
-- where seats are counted and written, for students of BOTH regions. US-new gets no copy of this file;
-- its read replica (a later migration) mirrors only the non-personal tables.
--
-- How it is called: only by the Worker, with the service_role key, after the Worker verified the
-- caller's JWT in the caller's own region and read their role/timezone fresh from that region
-- (worker/lib/lessons.ts). Every public.lesson_* function is SECURITY DEFINER and executable by
-- service_role only; the tables in schema `lessons` have no grants at all and are not exposed by
-- PostgREST (only `public` is). A student is identified by (region, user_id): each region has its own
-- auth.users, so a bare uuid is not enough.
--
-- Concurrency: every mutation first takes ONE global advisory lock (lessons.lock()). The scale is
-- small (tens of students, a handful of classes), a booking is a few milliseconds, and a single lock
-- cannot deadlock and cannot be forgotten on a code path. Seats are counted and written in the same
-- transaction under that lock, so no interleaving of bookings can exceed a class's capacity. (A plain
-- UNIQUE(seat) cannot do this job: a fixed enrollment is valid for EVERY future week and is not stored
-- one row per occurrence.) If this ever needs to scale, replace lessons.lock() with per-class locks
-- taken in a fixed order.
--
-- Time model (the plan, section 3): a class is (NY weekday, NY wall-clock time, duration), versioned by
-- NY date ranges. An occurrence is (class_id, ny_date); its instant is computed with
-- `AT TIME ZONE 'America/New_York'`, so the NY time is fixed and the student's local time moves when
-- the US or the student's country switches DST. Seats, cancellations and the waitlist work on
-- occurrences and know nothing about weeks. Only the quota ("lessons per week") and "move just this
-- week" use the STUDENT's own local week (their timezone and first weekday, a change of either applying
-- from the next week).
--
-- Errors: RAISE with SQLSTATE P0001 and message 'lesson:<code>' (see lessons.fail); the Worker maps
-- the code to an HTTP answer.

create schema if not exists lessons;
revoke all on schema lessons from public, anon, authenticated;

-- ===========================================================================================
-- Tables
-- ===========================================================================================

create table lessons.classes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- One row per period in which a class has the same schedule. valid_from/valid_until are NY dates
-- (valid_until exclusive, null = open-ended). Versions of one class never overlap (enforced by the
-- admin RPCs under the global lock). An enrollment points at the class, not at a version, so a student
-- follows the class when its time changes.
create table lessons.class_versions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references lessons.classes(id),
  valid_from date not null,
  valid_until date,
  weekday smallint not null check (weekday between 1 and 7),          -- ISO: 1 = Monday .. 7 = Sunday, in NY
  start_time time not null,                                           -- NY wall clock
  duration_min smallint not null check (duration_min between 10 and 240),
  capacity smallint not null check (capacity between 1 and 3),
  title text not null check (char_length(title) between 1 and 80),
  level_label text check (char_length(level_label) between 1 and 40),
  meeting_url text check (char_length(meeting_url) <= 500 and meeting_url ~ '^https://[^[:space:]]+$'),
  teacher_region text not null check (teacher_region in ('eu', 'us')),
  teacher_id uuid not null,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  -- 01:00-02:59 on a Sunday does not exist (spring) or happens twice (autumn) in New York.
  check (not (weekday = 7 and start_time >= time '01:00' and start_time < time '03:00'))
);
create index class_versions_class_idx on lessons.class_versions (class_id, valid_from);

create table lessons.students (
  region text not null check (region in ('eu', 'us')),
  user_id uuid not null,
  access boolean not null default false,
  access_until timestamptz,                 -- seats from this instant on are lost; null = no end
  can_move boolean not null default true,   -- false: keeps the booked seats but cannot change them
  weekly_quota smallint not null default 1 check (weekly_quota between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (region, user_id)
);

-- The student's timezone and first weekday for the quota week, as an append-only timeline: the row
-- with the greatest effective_from <= t governs instant t. A change is stored with effective_from =
-- the end of the current week, so it applies from the next week (and cannot be used to shift a week's
-- boundary to squeeze in one more lesson). There is at most one future row per student.
create table lessons.student_week_cfg (
  region text not null,
  user_id uuid not null,
  effective_from timestamptz not null,
  tz text not null,
  week_start smallint not null check (week_start between 1 and 7),    -- ISO weekday the week starts on
  primary key (region, user_id, effective_from),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade
);

-- A fixed enrollment: the student attends every occurrence of the class with from_date <= ny_date <
-- to_date (to_date null = open). Ending one (changing class, leaving, an admin releasing the class)
-- sets to_date to the first occurrence date that must NOT be attended any more.
create table lessons.enrollments (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  class_id uuid not null references lessons.classes(id),
  from_date date not null,
  to_date date,
  created_at timestamptz not null default now(),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade,
  check (to_date is null or to_date > from_date)
);
create index enrollments_class_idx on lessons.enrollments (class_id);
create index enrollments_student_idx on lessons.enrollments (region, user_id);
create unique index enrollments_one_open on lessons.enrollments (region, user_id, class_id) where to_date is null;

-- A one-week move: the student attends (to_class, to_date), and, when from_* is set, does NOT attend
-- that occurrence of their fixed class. Without from_* it is a plain extra lesson (a week that has
-- fewer lessons than the quota, e.g. around a DST change).
create table lessons.moves (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  from_class uuid references lessons.classes(id),
  from_date date,
  to_class uuid not null references lessons.classes(id),
  to_date date not null,
  created_at timestamptz not null default now(),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade,
  check ((from_class is null) = (from_date is null))
);
create unique index moves_to_uq on lessons.moves (region, user_id, to_class, to_date);
create unique index moves_from_uq on lessons.moves (region, user_id, from_class, from_date) where from_class is not null;
create index moves_to_class_idx on lessons.moves (to_class, to_date);
create index moves_from_class_idx on lessons.moves (from_class, from_date) where from_class is not null;

-- Append-only record of who changed what (access grants, class edits, ...).
create table lessons.audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_region text,
  actor_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb
);

create function lessons.audit_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'lessons.audit is append-only';
end;
$$;
create trigger audit_append_only before update or delete on lessons.audit
  for each row execute function lessons.audit_is_append_only();

alter table lessons.classes enable row level security;
alter table lessons.class_versions enable row level security;
alter table lessons.students enable row level security;
alter table lessons.student_week_cfg enable row level security;
alter table lessons.enrollments enable row level security;
alter table lessons.moves enable row level security;
alter table lessons.audit enable row level security;
revoke all on all tables in schema lessons from public, anon, authenticated;

-- ===========================================================================================
-- Internal helpers (schema lessons). Only the SECURITY DEFINER lesson_* functions below call them.
-- ===========================================================================================

-- The clock. One seam so the DST/cutoff scenarios can be tested by redefining just this function.
create function lessons.now() returns timestamptz
language sql stable as $$ select now() $$;

create function lessons.ny_today() returns date
language sql stable as $$ select (lessons.now() at time zone 'America/New_York')::date $$;

create function lessons.fail(p_code text, p_detail text default null) returns void
language plpgsql as $$
begin
  -- DETAIL cannot be NULL in a RAISE, so "no detail" is an empty one.
  raise exception '%', 'lesson:' || p_code using errcode = 'P0001', detail = coalesce(p_detail, '');
end;
$$;

create function lessons.lock() returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended('vici:lessons', 0)) $$;

create function lessons.log(p_actor_region text, p_actor_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql as $$
  insert into lessons.audit (actor_region, actor_id, action, details) values (p_actor_region, p_actor_id, p_action, p_details)
$$;

-- The version of a class governing one NY date, if that date is an occurrence (right weekday, inside
-- the version's range). Zero rows when it is not.
create function lessons.version_at(p_class uuid, p_date date) returns setof lessons.class_versions
language sql stable as $$
  select v.* from lessons.class_versions v
  where v.class_id = p_class
    and v.valid_from <= p_date
    and (v.valid_until is null or p_date < v.valid_until)
    and v.weekday = extract(isodow from p_date)::int
$$;

create function lessons.occ_start(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select (p_date + v.start_time) at time zone 'America/New_York' from lessons.version_at(p_class, p_date) v
$$;

create function lessons.occ_end(p_class uuid, p_date date) returns timestamptz
language sql stable as $$
  select ((p_date + v.start_time) at time zone 'America/New_York') + make_interval(mins => v.duration_min)
  from lessons.version_at(p_class, p_date) v
$$;

-- NY date of the first occurrence of a class that starts after p_after. The scan starts at the later
-- of today and the date the class's first still-relevant version begins (a class published weeks ahead
-- must be joinable), and covers two weeks from there: null when the class has ended.
create function lessons.next_occ(p_class uuid, p_after timestamptz) returns date
language sql stable as $$
  with base as (
    select greatest((p_after at time zone 'America/New_York')::date, min(v.valid_from)) as d0
    from lessons.class_versions v
    where v.class_id = p_class
      and (v.valid_until is null or v.valid_until > (p_after at time zone 'America/New_York')::date)
  )
  select g::date
  from base, generate_series(base.d0::timestamp, (base.d0 + 14)::timestamp, interval '1 day') g
  where lessons.occ_start(p_class, g::date) > p_after
  order by g
  limit 1
$$;

create function lessons.has_access(p_access boolean, p_until timestamptz, p_at timestamptz) returns boolean
language sql immutable as $$ select p_access and (p_until is null or p_at < p_until) $$;

-- A fixed enrollment still has occurrences ahead that the student attends.
create function lessons.is_open(p_class uuid, p_to date) returns boolean
language sql stable as $$
  select p_to is null or coalesce(lessons.next_occ(p_class, lessons.now()) < p_to, false)
$$;

-- Students occupying an occurrence: fixed enrollments that cover it (minus the ones that moved away
-- from it) plus the ones that moved into it, all with access at its start.
create function lessons.seats_taken(p_class uuid, p_date date) returns int
language sql stable as $$
  with occ as (select lessons.occ_start(p_class, p_date) as s)
  select (
    select count(*) from lessons.enrollments e
    join lessons.students st on st.region = e.region and st.user_id = e.user_id
    cross join occ
    where e.class_id = p_class and e.from_date <= p_date and (e.to_date is null or p_date < e.to_date)
      and lessons.has_access(st.access, st.access_until, occ.s)
      and not exists (
        select 1 from lessons.moves m
        where m.region = e.region and m.user_id = e.user_id and m.from_class = p_class and m.from_date = p_date)
  ) + (
    select count(*) from lessons.moves m
    join lessons.students st on st.region = m.region and st.user_id = m.user_id
    cross join occ
    where m.to_class = p_class and m.to_date = p_date
      and lessons.has_access(st.access, st.access_until, occ.s)
  )
$$;

-- Everything one student attends that STARTS in [p_from, p_to).
create function lessons.attended(p_region text, p_user uuid, p_from timestamptz, p_to timestamptz)
returns table(class_id uuid, ny_date date, starts_at timestamptz, ends_at timestamptz, source text)
language sql stable as $$
  with st as (select * from lessons.students s where s.region = p_region and s.user_id = p_user),
  days as (
    select g::date as d from generate_series(
      ((p_from at time zone 'America/New_York')::date - 1)::timestamp,
      ((p_to at time zone 'America/New_York')::date + 1)::timestamp,
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
  )
  select c.class_id, c.ny_date, o.s, o.e, c.source
  from cand c
  cross join lateral (select lessons.occ_start(c.class_id, c.ny_date) as s, lessons.occ_end(c.class_id, c.ny_date) as e) o
  cross join st
  where o.s is not null and o.s >= p_from and o.s < p_to and lessons.has_access(st.access, st.access_until, o.s)
$$;

-- The student's local week containing p_at: [win_start, win_end), by the config in force at p_at.
create function lessons.week_window(p_region text, p_user uuid, p_at timestamptz, out win_start timestamptz, out win_end timestamptz)
language plpgsql stable as $$
declare
  v_tz text;
  v_ws smallint;
  d date;
  sd date;
begin
  select c.tz, c.week_start into v_tz, v_ws
  from lessons.student_week_cfg c
  where c.region = p_region and c.user_id = p_user and c.effective_from <= p_at
  order by c.effective_from desc limit 1;
  if v_tz is null then
    v_tz := 'UTC';
    v_ws := 1;
  end if;
  d := (p_at at time zone v_tz)::date;
  sd := d - ((extract(isodow from d)::int - v_ws + 7) % 7);
  win_start := sd::timestamp at time zone v_tz;
  win_end := (sd + 7)::timestamp at time zone v_tz;
end;
$$;

-- Creates the student row and records timezone / first weekday changes. Either argument may be null
-- ("leave as it is"). A change is stored as the single future config row, effective from the end of
-- the current week.
create function lessons.set_cfg(p_region text, p_user uuid, p_tz text, p_week_start int) returns void
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
end;
$$;

-- Seats must not exceed capacity on one occurrence (after the change has been applied).
create function lessons.assert_seat(p_class uuid, p_date date) returns void
language plpgsql as $$
declare
  v_cap int;
  v_taken int;
begin
  select v.capacity into v_cap from lessons.version_at(p_class, p_date) v;
  if v_cap is null then
    return;
  end if;
  v_taken := lessons.seats_taken(p_class, p_date);
  if v_taken > v_cap then
    perform lessons.fail('class_full', format('%s: %s of %s seats on %s', p_class, v_taken, v_cap, p_date));
  end if;
end;
$$;

-- Same, for EVERY occurrence of the class from p_from on. Seat counts only change at dates that
-- appear in the data (enrollment/move/version boundaries, access ends), so checking up to the last such
-- date plus a week covers the whole future.
create function lessons.assert_capacity(p_class uuid, p_from date) returns void
language plpgsql as $$
declare
  v_last date;
  d date;
begin
  select coalesce(max(x), p_from) into v_last from (
    select m.to_date as x from lessons.moves m where m.to_class = p_class
    union all select m.from_date from lessons.moves m where m.from_class = p_class
    union all select e.from_date from lessons.enrollments e where e.class_id = p_class
    union all select e.to_date from lessons.enrollments e where e.class_id = p_class
    union all select v.valid_from from lessons.class_versions v where v.class_id = p_class
    union all select v.valid_until from lessons.class_versions v where v.class_id = p_class
    union all
      select (s.access_until at time zone 'America/New_York')::date
      from lessons.students s
      join lessons.enrollments e on e.region = s.region and e.user_id = s.user_id
      where e.class_id = p_class and s.access_until is not null
  ) t;
  v_last := least(greatest(v_last, p_from) + 7, p_from + 730);
  for d in select g::date from generate_series(p_from::timestamp, v_last::timestamp, interval '1 day') g loop
    perform lessons.assert_seat(p_class, d);
  end loop;
end;
$$;

-- No two lessons of the student overlap in time, among the occurrences of p_class from p_from on
-- (next 12 weeks). Overlaps that existed before are not this change's fault.
create function lessons.assert_no_overlap(p_region text, p_user uuid, p_class uuid, p_from timestamptz) returns void
language plpgsql as $$
begin
  if exists (
    select 1
    from lessons.attended(p_region, p_user, p_from, p_from + interval '84 days') a
    join lessons.attended(p_region, p_user, p_from, p_from + interval '84 days') b
      on a.class_id = p_class and b.class_id <> p_class and a.starts_at < b.ends_at and b.starts_at < a.ends_at
  ) then
    perform lessons.fail('time_conflict');
  end if;
end;
$$;

-- Gives up everything a student has in the future: their seats are freed from the next occurrence of
-- each class. Used when an account becomes a teacher.
create function lessons.drop_future(p_region text, p_user uuid) returns void
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
end;
$$;

-- ===========================================================================================
-- Student RPCs (public, service_role only)
-- ===========================================================================================

-- The calendar: every occurrence starting in [p_from, p_to) with its seats, and which ones are the
-- student's own. The meeting link is only included for the student's own lessons.
create function public.lesson_get_schedule(p_region text, p_user_id uuid, p_tz text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  st lessons.students;
  v_cfg lessons.student_week_cfg;
  v_pend lessons.student_week_cfg;
  v_occ jsonb;
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
      'meeting_url', case when mine.source is not null then occ.meeting_url end
    ) order by occ.s, occ.class_id), '[]'::jsonb)
  into v_occ
  from occ
  left join mine on mine.class_id = occ.class_id and mine.ny_date = occ.d
  where occ.s >= p_from and occ.s < p_to;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'access', lessons.has_access(st.access, st.access_until, v_now),
      'access_until', st.access_until,
      'can_move', st.can_move,
      'weekly_quota', st.weekly_quota,
      'tz', v_cfg.tz,
      'week_start', v_cfg.week_start,
      'pending', case when v_pend.effective_from is null then null else jsonb_build_object(
        'effective_from', v_pend.effective_from, 'tz', v_pend.tz, 'week_start', v_pend.week_start) end
    ),
    'occurrences', v_occ
  );
end;
$$;

-- Picks (or changes) the student's fixed class: from the first occurrence that has not started, every
-- week. p_replace_class_id says which of the student's current fixed classes it replaces (needs
-- can_move); without it the student is ADDING a class and must have a free slot in their quota.
create function public.lesson_enroll(p_region text, p_user_id uuid, p_tz text, p_class_id uuid, p_replace_class_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  v_from date;
  v_existing lessons.enrollments;
  v_old lessons.enrollments;
  v_open int;
  v_end date;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;

  if not lessons.has_access(st.access, st.access_until, v_now) then
    perform lessons.fail('no_access');
  end if;
  v_from := lessons.next_occ(p_class_id, v_now);
  if v_from is null then
    perform lessons.fail('class_not_found');
  end if;
  if not lessons.has_access(st.access, st.access_until, lessons.occ_start(p_class_id, v_from)) then
    perform lessons.fail('no_access');
  end if;
  if p_replace_class_id = p_class_id then
    perform lessons.fail('invalid_request');
  end if;

  select * into v_existing from lessons.enrollments e
  where e.region = p_region and e.user_id = p_user_id and e.class_id = p_class_id and lessons.is_open(e.class_id, e.to_date)
  order by e.id desc limit 1;
  if found and v_existing.to_date is null then
    perform lessons.fail('already_enrolled');
  end if;

  if p_replace_class_id is null then
    select count(*) into v_open from lessons.enrollments e
    where e.region = p_region and e.user_id = p_user_id and e.class_id <> p_class_id and lessons.is_open(e.class_id, e.to_date);
    if v_open >= st.weekly_quota then
      perform lessons.fail('quota_reached');
    end if;
  else
    if not st.can_move then
      perform lessons.fail('cannot_move');
    end if;
    select * into v_old from lessons.enrollments e
    where e.region = p_region and e.user_id = p_user_id and e.class_id = p_replace_class_id and lessons.is_open(e.class_id, e.to_date)
    order by e.id desc limit 1;
    if not found then
      perform lessons.fail('not_enrolled');
    end if;
    v_end := coalesce(lessons.next_occ(p_replace_class_id, v_now), lessons.ny_today());
    if v_end <= v_old.from_date then
      delete from lessons.enrollments where id = v_old.id;
    else
      update lessons.enrollments set to_date = least(coalesce(to_date, v_end), v_end) where id = v_old.id;
    end if;
    -- A one-week move away from an occurrence that is no longer the student's fixed one is just an extra lesson now.
    update lessons.moves m set from_class = null, from_date = null
    where m.region = p_region and m.user_id = p_user_id and m.from_class = p_replace_class_id and m.from_date >= v_end;
  end if;

  if v_existing.id is not null then
    update lessons.enrollments set to_date = null where id = v_existing.id;
  else
    insert into lessons.enrollments (region, user_id, class_id, from_date) values (p_region, p_user_id, p_class_id, v_from);
  end if;

  perform lessons.assert_capacity(p_class_id, v_from);
  perform lessons.assert_no_overlap(p_region, p_user_id, p_class_id, v_now);
  perform lessons.log(p_region, p_user_id, 'enroll',
    jsonb_build_object('class_id', p_class_id, 'replaces', p_replace_class_id, 'from_date', v_from));

  return jsonb_build_object('class_id', p_class_id, 'from_date', v_from);
end;
$$;

-- Leaves a fixed class (needs can_move): the seat is freed from the next occurrence.
create function public.lesson_unenroll(p_region text, p_user_id uuid, p_tz text, p_class_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  v_old lessons.enrollments;
  v_end date;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  if not st.can_move then
    perform lessons.fail('cannot_move');
  end if;
  select * into v_old from lessons.enrollments e
  where e.region = p_region and e.user_id = p_user_id and e.class_id = p_class_id and lessons.is_open(e.class_id, e.to_date)
  order by e.id desc limit 1;
  if not found then
    perform lessons.fail('not_enrolled');
  end if;
  v_end := coalesce(lessons.next_occ(p_class_id, v_now), lessons.ny_today());
  if v_end <= v_old.from_date then
    delete from lessons.enrollments where id = v_old.id;
  else
    update lessons.enrollments set to_date = least(coalesce(to_date, v_end), v_end) where id = v_old.id;
  end if;
  update lessons.moves m set from_class = null, from_date = null
  where m.region = p_region and m.user_id = p_user_id and m.from_class = p_class_id and m.from_date >= v_end;
  perform lessons.log(p_region, p_user_id, 'unenroll', jsonb_build_object('class_id', p_class_id, 'to_date', v_end));
  return jsonb_build_object('class_id', p_class_id, 'to_date', v_end);
end;
$$;

-- "Just this week": attend (p_to_class, p_to_date) instead of the fixed occurrence (p_from_*), or as an
-- extra lesson when p_from_* is null. The quota is judged on the student's local week of the target:
-- a week may end up with as many lessons as max(quota, lessons it already had), so a swap always fits,
-- an addition only when the week has room (a week emptied by a DST shift has room).
create function public.lesson_move_once(
  p_region text, p_user_id uuid, p_tz text, p_to_class uuid, p_to_date date,
  p_from_class uuid default null, p_from_date date default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
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
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;

  if (p_from_class is null) <> (p_from_date is null) then
    perform lessons.fail('invalid_request');
  end if;
  if not st.can_move then
    perform lessons.fail('cannot_move');
  end if;

  v_to_start := lessons.occ_start(p_to_class, p_to_date);
  v_to_end := lessons.occ_end(p_to_class, p_to_date);
  if v_to_start is null then
    perform lessons.fail('not_an_occurrence');
  end if;
  if v_to_start <= v_now then
    perform lessons.fail('too_late');
  end if;
  if not lessons.has_access(st.access, st.access_until, v_to_start) then
    perform lessons.fail('no_access');
  end if;

  if exists (select 1 from lessons.attended(p_region, p_user_id, v_to_start, v_to_start + interval '1 second') a
             where a.class_id = p_to_class and a.ny_date = p_to_date) then
    perform lessons.fail('already_attending');
  end if;

  if p_from_class is not null then
    v_from_start := lessons.occ_start(p_from_class, p_from_date);
    if v_from_start is null or v_from_start <= v_now then
      perform lessons.fail('too_late');
    end if;
    if not exists (select 1 from lessons.attended(p_region, p_user_id, v_from_start, v_from_start + interval '1 second') a
                   where a.class_id = p_from_class and a.ny_date = p_from_date and a.source = 'standing') then
      perform lessons.fail('not_attending');
    end if;
  end if;

  select w.win_start, w.win_end into v_win_start, v_win_end from lessons.week_window(p_region, p_user_id, v_to_start) w;

  -- The student's lessons in that week, not counting the one being given up.
  select count(*) into v_before from lessons.attended(p_region, p_user_id, v_win_start, v_win_end) a;
  v_after := v_before + 1 - case when v_from_start >= v_win_start and v_from_start < v_win_end then 1 else 0 end;
  if v_after > greatest(st.weekly_quota, v_before) then
    perform lessons.fail('quota_reached');
  end if;

  -- Two seats in the same class in one week, or two lessons at the same time, are not allowed.
  if exists (
    select 1 from lessons.attended(p_region, p_user_id, v_win_start, v_win_end) a
    where a.class_id = p_to_class and not (p_from_class is not null and a.class_id = p_from_class and a.ny_date = p_from_date)
  ) then
    perform lessons.fail('same_class_twice');
  end if;
  if exists (
    select 1 from lessons.attended(p_region, p_user_id, v_to_start - interval '1 day', v_to_end) a
    where a.starts_at < v_to_end and v_to_start < a.ends_at
      and not (p_from_class is not null and a.class_id = p_from_class and a.ny_date = p_from_date)
  ) then
    perform lessons.fail('time_conflict');
  end if;

  insert into lessons.moves (region, user_id, from_class, from_date, to_class, to_date)
  values (p_region, p_user_id, p_from_class, p_from_date, p_to_class, p_to_date);

  perform lessons.assert_seat(p_to_class, p_to_date);
  perform lessons.log(p_region, p_user_id, 'move_once', jsonb_build_object(
    'to_class', p_to_class, 'to_date', p_to_date, 'from_class', p_from_class, 'from_date', p_from_date));

  return jsonb_build_object('to_class', p_to_class, 'to_date', p_to_date, 'from_class', p_from_class, 'from_date', p_from_date);
end;
$$;

-- Undoes a one-week move: back to the fixed occurrence (which must still have a seat).
create function public.lesson_unmove(p_region text, p_user_id uuid, p_tz text, p_to_class uuid, p_to_date date)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  mv lessons.moves;
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  if not st.can_move then
    perform lessons.fail('cannot_move');
  end if;
  select * into mv from lessons.moves m
  where m.region = p_region and m.user_id = p_user_id and m.to_class = p_to_class and m.to_date = p_to_date;
  if not found then
    perform lessons.fail('not_found');
  end if;
  if lessons.occ_start(mv.to_class, mv.to_date) <= v_now then
    perform lessons.fail('too_late');
  end if;
  delete from lessons.moves where id = mv.id;
  if mv.from_class is not null then
    perform lessons.assert_seat(mv.from_class, mv.from_date);
  end if;
  perform lessons.log(p_region, p_user_id, 'unmove', jsonb_build_object('to_class', p_to_class, 'to_date', p_to_date));
  return jsonb_build_object('to_class', p_to_class, 'to_date', p_to_date);
end;
$$;

-- The student's own setting: the weekday their week starts on (applies from the next week).
create function public.lesson_set_week_start(p_region text, p_user_id uuid, p_tz text, p_week_start int)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, p_week_start);
  return jsonb_build_object('week_start', p_week_start);
end;
$$;

-- ===========================================================================================
-- Admin / teacher RPCs. The Worker passes the actor's role, read from the actor's own region.
-- ===========================================================================================

-- Access, move permission and quota of one student. Admins and teachers may call it. A teacher account
-- cannot be a student. Turning access ON or moving its end date later re-checks every seat the student
-- holds (their enrollments come back to life), so it can never overbook a class that filled up meanwhile.
create function public.lesson_admin_set_student(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_region text, p_user_id uuid, p_tz text, p_target_is_teacher boolean,
  p_access boolean, p_access_until timestamptz, p_can_move boolean, p_weekly_quota int)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  c uuid;
begin
  perform lessons.lock();
  if p_actor_role not in ('admin', 'teacher') then
    perform lessons.fail('forbidden');
  end if;
  if p_target_is_teacher and p_access then
    perform lessons.fail('teacher_cannot_be_student');
  end if;
  if p_weekly_quota not between 1 and 7 then
    perform lessons.fail('invalid_quota');
  end if;
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);

  update lessons.students s
  set access = p_access, access_until = p_access_until, can_move = p_can_move, weekly_quota = p_weekly_quota, updated_at = now()
  where s.region = p_region and s.user_id = p_user_id;

  for c in
    select e.class_id from lessons.enrollments e where e.region = p_region and e.user_id = p_user_id
    union select m.to_class from lessons.moves m where m.region = p_region and m.user_id = p_user_id
  loop
    perform lessons.assert_capacity(c, lessons.ny_today());
  end loop;

  perform lessons.log(p_actor_region, p_actor_id, 'set_student', jsonb_build_object(
    'region', p_region, 'user_id', p_user_id, 'access', p_access, 'access_until', p_access_until,
    'can_move', p_can_move, 'weekly_quota', p_weekly_quota));
  return jsonb_build_object('region', p_region, 'user_id', p_user_id);
end;
$$;

-- An account became a teacher: it stops being a student (seats freed from the next occurrence).
create function public.lesson_student_became_teacher(p_region text, p_user_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  update lessons.students set access = false, updated_at = now() where region = p_region and user_id = p_user_id;
  perform lessons.drop_future(p_region, p_user_id);
  perform lessons.log(null, null, 'became_teacher', jsonb_build_object('region', p_region, 'user_id', p_user_id));
end;
$$;

-- How many classes (current or future) an account teaches. The Worker refuses to switch a teacher
-- off while this is above zero, so a class is never left with a teacher who cannot teach.
create function public.lesson_teacher_class_count(p_region text, p_user_id uuid)
returns int
language sql stable security definer set search_path = pg_catalog, lessons
as $$
  select count(distinct v.class_id)::int from lessons.class_versions v
  where v.teacher_region = p_region and v.teacher_id = p_user_id
    and (v.valid_until is null or v.valid_until > lessons.ny_today())
$$;

-- A region move gives the person a new account (new user id, maybe another region): everything of the
-- old one follows. Also re-points classes they teach.
create function public.lesson_rekey_student(p_old_region text, p_old_id uuid, p_new_region text, p_new_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  if exists (select 1 from lessons.students s where s.region = p_new_region and s.user_id = p_new_id) then
    perform lessons.fail('target_exists');
  end if;
  update lessons.students set region = p_new_region, user_id = p_new_id where region = p_old_region and user_id = p_old_id;
  update lessons.class_versions set teacher_region = p_new_region, teacher_id = p_new_id
  where teacher_region = p_old_region and teacher_id = p_old_id;
  perform lessons.log(null, null, 'rekey', jsonb_build_object(
    'old', jsonb_build_object('region', p_old_region, 'user_id', p_old_id),
    'new', jsonb_build_object('region', p_new_region, 'user_id', p_new_id)));
end;
$$;

-- New class: its first version starts on p_valid_from (a NY date, not in the past).
create function public.lesson_admin_create_class(
  p_actor_region text, p_actor_id uuid, p_actor_role text,
  p_teacher_region text, p_teacher_id uuid,
  p_weekday int, p_start_time time, p_duration_min int, p_capacity int,
  p_title text, p_level_label text, p_meeting_url text, p_valid_from date)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_class uuid;
begin
  perform lessons.lock();
  if p_actor_role <> 'admin' then
    perform lessons.fail('forbidden');
  end if;
  if p_valid_from < lessons.ny_today() then
    perform lessons.fail('date_in_past');
  end if;
  insert into lessons.classes default values returning id into v_class;
  insert into lessons.class_versions (class_id, valid_from, weekday, start_time, duration_min, capacity, title,
                                      level_label, meeting_url, teacher_region, teacher_id)
  values (v_class, p_valid_from, p_weekday, p_start_time, p_duration_min, p_capacity, p_title,
          p_level_label, p_meeting_url, p_teacher_region, p_teacher_id);
  perform lessons.log(p_actor_region, p_actor_id, 'create_class', jsonb_build_object('class_id', v_class));
  return jsonb_build_object('class_id', v_class);
end;
$$;

-- Changes a class from a NY date on. p_mode:
--   'follow'  the class changes; enrolled students stay enrolled and follow its new schedule
--   'release' enrolled students are released from p_effective_from on, and a NEW class (no students)
--             takes over from that date with the changes applied
--   'end'     the class stops at p_effective_from and its students are released (no replacement)
-- p_changes holds only the fields to change (weekday, start_time, duration_min, capacity, title,
-- level_label, meeting_url, teacher_region, teacher_id). Later versions of the class are replaced.
-- Returns the students whose lessons changed, so the caller can notify them.
create function public.lesson_admin_update_class(
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
begin
  perform lessons.lock();
  if p_actor_role <> 'admin' then
    perform lessons.fail('forbidden');
  end if;
  if p_mode not in ('follow', 'release', 'end') then
    perform lessons.fail('invalid_request');
  end if;
  if p_effective_from < v_today then
    perform lessons.fail('date_in_past');
  end if;

  select * into b from lessons.class_versions v
  where v.class_id = p_class_id and v.valid_from <= p_effective_from and (v.valid_until is null or p_effective_from < v.valid_until);
  if not found then
    perform lessons.fail('class_not_found');
  end if;

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
    -- One-week moves into the class after that date disappear; a vacated occurrence is a plain extra lesson now.
    delete from lessons.moves m where m.to_class = p_class_id and m.to_date >= p_effective_from;
    get diagnostics v_dropped_moves = row_count;
    update lessons.moves m set from_class = null, from_date = null
    where m.from_class = p_class_id and m.from_date >= p_effective_from;
    delete from lessons.class_versions v where v.class_id = p_class_id and v.valid_from > p_effective_from;
    if b.valid_from = p_effective_from then
      delete from lessons.class_versions v where v.id = b.id;
    else
      update lessons.class_versions v set valid_until = p_effective_from where v.id = b.id;
    end if;
  end if;

  if p_mode = 'end' then
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
    -- One-week moves that pointed at dates which are not occurrences any more (the weekday changed).
    delete from lessons.moves m
    where m.to_class = p_class_id and m.to_date >= p_effective_from and lessons.occ_start(m.to_class, m.to_date) is null;
    get diagnostics v_dropped_moves = row_count;
    update lessons.moves m set from_class = null, from_date = null
    where m.from_class = p_class_id and m.from_date >= p_effective_from and lessons.occ_start(m.from_class, m.from_date) is null;
    -- A smaller capacity must still hold the seats already taken.
    perform lessons.assert_capacity(p_class_id, p_effective_from);
  end if;

  perform lessons.log(p_actor_region, p_actor_id, 'update_class', jsonb_build_object(
    'class_id', p_class_id, 'new_class_id', v_new_class, 'mode', p_mode, 'effective_from', p_effective_from,
    'changes', p_changes));
  return jsonb_build_object('class_id', v_new_class, 'affected', v_affected, 'dropped_moves', v_dropped_moves);
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

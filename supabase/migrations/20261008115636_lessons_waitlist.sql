-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 5a of docs/LESSON_BOOKING_PLAN.md: the waitlist,
-- on top of 20261008111342_lessons_notifications.sql.
--
-- A student can ask to be told when a FULL class (for a fixed enrollment) or a FULL lesson (for one week)
-- gets a free seat. There is no queue order: when a seat opens EVERYBODY waiting for it is told, and the
-- first one to confirm gets it. Confirming runs the normal enroll / move code (under the global lock), so
-- access, weekly limit, overlaps and the seat itself are all checked again at that moment.
--
-- "A seat opened" is not hooked into every place that can free one (leaving, moving away, an access that
-- ended, a bigger capacity, a lesson restored...). Instead lessons.waitlist_sweep() looks at the FINAL
-- state: it runs at the end of every transaction that touched seats (deferred constraint triggers) and
-- from the scheduler tick. An entry is "armed" while its target is full; the first time the target has
-- room the entry is told and disarmed; when the room is gone again it is armed again, so the next opening
-- tells it again.

-- ===========================================================================================
-- Table
-- ===========================================================================================

create table lessons.waitlist (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  class_id uuid not null references lessons.classes(id),
  kind text not null check (kind in ('fixed', 'once')),
  ny_date date,                                           -- once: the lesson (template NY date); fixed: null
  replace_class uuid references lessons.classes(id),      -- fixed: the weekly class they would give up for it
  swap_class uuid references lessons.classes(id),         -- once: the (weekly) lesson they would give up
  swap_date date,
  armed boolean not null default true,
  episodes int not null default 0,                        -- how many times it has been told (part of the notice's dedup key)
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade,
  check ((kind = 'once') = (ny_date is not null)),
  check ((swap_class is null) = (swap_date is null)),
  check (kind = 'once' or swap_class is null),
  check (kind = 'fixed' or replace_class is null)
);
create unique index waitlist_fixed_uq on lessons.waitlist (region, user_id, class_id) where kind = 'fixed';
create unique index waitlist_once_uq on lessons.waitlist (region, user_id, class_id, ny_date) where kind = 'once';
create index waitlist_student_idx on lessons.waitlist (region, user_id);
create index waitlist_class_idx on lessons.waitlist (class_id);
alter table lessons.waitlist enable row level security;
revoke all on lessons.waitlist from public, anon, authenticated;

-- ===========================================================================================
-- Is there room?
-- ===========================================================================================

-- Room for one more FIXED student in every occurrence of the class from p_from on: the same horizon and the
-- same test as lessons.assert_capacity (which checks after adding the student, i.e. taken + 1 <= capacity).
create function lessons.class_has_room(p_class uuid, p_from date) returns boolean
language plpgsql stable as $$
declare
  v_last date;
  v_cap int;
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
    select v.capacity into v_cap from lessons.version_at(p_class, d) v;
    if v_cap is not null and lessons.seats_taken(p_class, d) >= v_cap then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Room for the thing this entry waits for, right now.
create function lessons.entry_has_room(w lessons.waitlist) returns boolean
language plpgsql stable as $$
declare
  v_now timestamptz := lessons.now();
  v_start timestamptz;
  v_cap int;
  v_from date;
begin
  if w.kind = 'once' then
    v_start := lessons.occ_start(w.class_id, w.ny_date);       -- null while the lesson is cancelled
    if v_start is null or v_start <= v_now then
      return false;
    end if;
    select v.capacity into v_cap from lessons.version_at(w.class_id, w.ny_date) v;
    return v_cap is not null and lessons.seats_taken(w.class_id, w.ny_date) < v_cap;
  end if;
  v_from := lessons.next_occ(w.class_id, v_now);
  return v_from is not null and lessons.class_has_room(w.class_id, v_from);
end;
$$;

-- The student already has what they were waiting for (they got it some other way).
create function lessons.entry_satisfied(w lessons.waitlist) returns boolean
language plpgsql stable as $$
declare
  v_start timestamptz;
begin
  if w.kind = 'fixed' then
    return exists (
      select 1 from lessons.enrollments e
      where e.region = w.region and e.user_id = w.user_id and e.class_id = w.class_id and lessons.is_open(e.class_id, e.to_date));
  end if;
  v_start := lessons.occ_start_any(w.class_id, w.ny_date);
  return v_start is not null and exists (
    select 1 from lessons.attended_x(w.region, w.user_id, v_start, v_start + interval '1 second', true) a
    where a.class_id = w.class_id and a.ny_date = w.ny_date);
end;
$$;

-- ===========================================================================================
-- The sweep
-- ===========================================================================================

create function lessons.waitlist_sweep() returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  w lessons.waitlist;
  st lessons.students;
  v_has_room boolean;
  v_title text;
  v_from date;
  v_start timestamptz;
  v_old text;
  v_swap_start timestamptz;
  v_swap_title text;
  v_open int;
  v_body text;
  v_dropped int := 0;
  v_notified int := 0;
begin
  for w in select * from lessons.waitlist order by id loop
    select * into st from lessons.students s where s.region = w.region and s.user_id = w.user_id;

    -- Housekeeping: entries that can never be served.
    if not lessons.has_access(st.access, st.access_until, v_now)
       or (w.kind = 'once' and coalesce(lessons.occ_start_any(w.class_id, w.ny_date), '-infinity') <= v_now)
       or (w.kind = 'fixed' and lessons.next_occ(w.class_id, v_now) is null)
       or lessons.entry_satisfied(w)
    then
      delete from lessons.waitlist where id = w.id;
      v_dropped := v_dropped + 1;
      continue;
    end if;

    v_has_room := lessons.entry_has_room(w);

    if v_has_room and w.armed then
      if w.kind = 'once' then
        v_start := lessons.occ_start(w.class_id, w.ny_date);
        select v.title into v_title from lessons.version_at(w.class_id, w.ny_date) v;
        v_body := format('A seat opened in "%s" on %s (your time).', v_title, lessons.fmt_local(v_start, w.region, w.user_id));
        if w.swap_class is not null then
          v_swap_start := lessons.occ_start(w.swap_class, w.swap_date);
          select v.title into v_swap_title from lessons.version_at(w.swap_class, w.swap_date) v;
          if v_swap_start is not null then
            v_body := v_body || format(' Confirming replaces your lesson "%s" on %s.', v_swap_title, lessons.fmt_local(v_swap_start, w.region, w.user_id));
          end if;
        end if;
      else
        v_from := lessons.next_occ(w.class_id, v_now);
        v_start := lessons.occ_start(w.class_id, v_from);
        select v.title into v_title from lessons.version_at(w.class_id, v_from) v;
        v_body := format('A seat opened in the weekly class "%s", starting %s (your time).', v_title, lessons.fmt_local(v_start, w.region, w.user_id));
        if w.replace_class is not null then
          select count(*) into v_open from lessons.enrollments e
          where e.region = w.region and e.user_id = w.user_id and e.class_id <> w.class_id and lessons.is_open(e.class_id, e.to_date);
          select v.title into v_old
          from lessons.class_versions v
          where v.class_id = w.replace_class order by v.valid_from desc limit 1;
          if v_open >= st.weekly_quota and exists (
               select 1 from lessons.enrollments e
               where e.region = w.region and e.user_id = w.user_id and e.class_id = w.replace_class and lessons.is_open(e.class_id, e.to_date)) then
            v_body := v_body || format(' You can have %s weekly %s, so confirming moves you from "%s" to "%s".',
                                       st.weekly_quota, case when st.weekly_quota = 1 then 'class' else 'classes' end, v_old, v_title);
          end if;
        end if;
      end if;
      v_body := v_body || ' Everybody on the waitlist is told: the first to confirm gets the seat.';

      perform lessons.notify(
        w.region, w.user_id, 'waitlist_seat', format('wl:%s:%s', w.id, w.episodes + 1),
        'A seat opened for you', v_body,
        jsonb_build_object('entry_id', w.id, 'class_id', w.class_id, 'kind', w.kind, 'ny_date', w.ny_date),
        true,
        case when w.kind = 'once' then v_start else null end);
      update lessons.waitlist set armed = false, notified_at = v_now, episodes = episodes + 1 where id = w.id;
      v_notified := v_notified + 1;
    elsif not v_has_room and not w.armed then
      update lessons.waitlist set armed = true where id = w.id;
    end if;
  end loop;
  return jsonb_build_object('waitlist_notified', v_notified, 'waitlist_dropped', v_dropped);
end;
$$;

-- At the end of every transaction that changed anything a seat count depends on, once per transaction.
create function lessons.waitlist_trigger() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('lessons.swept', true), '') <> '1' then
    perform set_config('lessons.swept', '1', true);
    perform lessons.waitlist_sweep();
  end if;
  return null;
end;
$$;

create constraint trigger waitlist_after_enrollments after insert or update or delete on lessons.enrollments
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();
create constraint trigger waitlist_after_moves after insert or update or delete on lessons.moves
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();
create constraint trigger waitlist_after_students after update or delete on lessons.students
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();
create constraint trigger waitlist_after_versions after insert or update or delete on lessons.class_versions
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();
create constraint trigger waitlist_after_overrides after insert or update or delete on lessons.occurrence_overrides
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();
create constraint trigger waitlist_after_vacations after insert or update or delete on lessons.vacations
  deferrable initially deferred for each row execute function lessons.waitlist_trigger();

-- The scheduler tick also sweeps (time passing, lessons that began, classes that ended).
create or replace function public.lesson_scheduler_tick() returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_made jsonb;
  v_swept jsonb;
  v_purged int;
begin
  perform lessons.lock();
  v_made := lessons.materialize_due();
  v_swept := lessons.waitlist_sweep();
  -- Housekeeping: a notice nobody has to act on any more is dropped after half a year.
  delete from lessons.notifications
  where created_at < lessons.now() - interval '180 days' and email_state in ('none', 'sent', 'skipped', 'failed');
  get diagnostics v_purged = row_count;
  return v_made || v_swept || jsonb_build_object('purged', v_purged);
end;
$$;

-- ===========================================================================================
-- Public RPCs (service_role only; the Worker is the only caller)
-- ===========================================================================================

-- The student's own waitlist, with whether there is room right now.
create function public.lesson_waitlist_list(p_region text, p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, lessons
as $$
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  return jsonb_build_object('entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id,
      'kind', w.kind,
      'class_id', w.class_id,
      'ny_date', w.ny_date,
      'title', (select v.title from lessons.class_versions v where v.class_id = w.class_id
                order by (v.valid_until is null or v.valid_until > lessons.ny_today()) desc, v.valid_from desc limit 1),
      'starts_at', case when w.kind = 'once' then lessons.occ_start(w.class_id, w.ny_date)
                        else lessons.occ_start(w.class_id, lessons.next_occ(w.class_id, lessons.now())) end,
      'available', lessons.entry_has_room(w),
      'replace_class', w.replace_class,
      'replace_title', (select v.title from lessons.class_versions v where v.class_id = w.replace_class order by v.valid_from desc limit 1),
      'swap_class', w.swap_class,
      'swap_date', w.swap_date,
      'swap_title', (select v.title from lessons.version_at(w.swap_class, w.swap_date) v),
      'swap_starts_at', lessons.occ_start(w.swap_class, w.swap_date),
      'created_at', w.created_at) order by w.id)
    from lessons.waitlist w where w.region = p_region and w.user_id = p_user_id), '[]'::jsonb));
end;
$$;

create function public.lesson_waitlist_join(
  p_region text, p_user_id uuid, p_tz text, p_class_id uuid, p_kind text, p_ny_date date default null,
  p_replace_class uuid default null, p_swap_class uuid default null, p_swap_date date default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  st lessons.students;
  w lessons.waitlist;
  v_id bigint;
  v_from date;
  v_start timestamptz;
  v_cap int;
begin
  if p_kind not in ('fixed', 'once') then
    perform lessons.fail('invalid_request');
  end if;
  if (p_kind = 'once') <> (p_ny_date is not null) or (p_swap_class is null) <> (p_swap_date is null)
     or (p_kind = 'once' and p_replace_class is not null) or (p_kind = 'fixed' and p_swap_class is not null) then
    perform lessons.fail('invalid_request');
  end if;

  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;
  if not lessons.has_access(st.access, st.access_until, v_now) then
    perform lessons.fail('no_access');
  end if;
  if (select count(*) from lessons.waitlist x where x.region = p_region and x.user_id = p_user_id) >= 3 then
    perform lessons.fail('waitlist_limit');
  end if;
  if (p_replace_class is not null or p_swap_class is not null) and not st.can_move then
    perform lessons.fail('cannot_move');
  end if;

  if p_kind = 'fixed' then
    v_from := lessons.next_occ(p_class_id, v_now);
    if v_from is null then
      perform lessons.fail('class_not_found');
    end if;
    if (select c.kind from lessons.classes c where c.id = p_class_id) is distinct from 'weekly' then
      perform lessons.fail('not_a_weekly_class');
    end if;
    if exists (select 1 from lessons.enrollments e
               where e.region = p_region and e.user_id = p_user_id and e.class_id = p_class_id and lessons.is_open(e.class_id, e.to_date)) then
      perform lessons.fail('already_enrolled');
    end if;
    if lessons.class_has_room(p_class_id, v_from) then
      perform lessons.fail('not_full');
    end if;
    if p_replace_class is not null and not exists (
         select 1 from lessons.enrollments e
         where e.region = p_region and e.user_id = p_user_id and e.class_id = p_replace_class and lessons.is_open(e.class_id, e.to_date)) then
      perform lessons.fail('not_enrolled');
    end if;
  else
    if lessons.occ_start_any(p_class_id, p_ny_date) is null then
      perform lessons.fail('not_an_occurrence');
    end if;
    if lessons.is_cancelled(p_class_id, p_ny_date) then
      perform lessons.fail('cancelled');
    end if;
    v_start := lessons.occ_start(p_class_id, p_ny_date);
    if v_start <= v_now then
      perform lessons.fail('too_late');
    end if;
    if lessons.entry_satisfied(row(0, p_region, p_user_id, p_class_id, 'once', p_ny_date, null, null, null, true, 0, null, v_now)::lessons.waitlist) then
      perform lessons.fail('already_attending');
    end if;
    select v.capacity into v_cap from lessons.version_at(p_class_id, p_ny_date) v;
    if lessons.seats_taken(p_class_id, p_ny_date) < v_cap then
      perform lessons.fail('not_full');
    end if;
    if p_swap_class is not null and not exists (
         select 1 from lessons.attended(p_region, p_user_id, lessons.occ_start(p_swap_class, p_swap_date), lessons.occ_start(p_swap_class, p_swap_date) + interval '1 second') a
         where a.class_id = p_swap_class and a.ny_date = p_swap_date and a.source = 'standing') then
      perform lessons.fail('not_attending');
    end if;
  end if;

  begin
    insert into lessons.waitlist (region, user_id, class_id, kind, ny_date, replace_class, swap_class, swap_date)
    values (p_region, p_user_id, p_class_id, p_kind, p_ny_date, p_replace_class, p_swap_class, p_swap_date)
    returning id into v_id;
  exception when unique_violation then
    perform lessons.fail('already_waiting');
  end;
  perform lessons.log(p_region, p_user_id, 'waitlist_join',
    jsonb_build_object('entry', v_id, 'class_id', p_class_id, 'kind', p_kind, 'ny_date', p_ny_date));
  return jsonb_build_object('id', v_id);
end;
$$;

create function public.lesson_waitlist_leave(p_region text, p_user_id uuid, p_entry_id bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  delete from lessons.waitlist w where w.id = p_entry_id and w.region = p_region and w.user_id = p_user_id;
  if not found then
    perform lessons.fail('not_found');
  end if;
  return jsonb_build_object('id', p_entry_id);
end;
$$;

-- The first to confirm gets the seat. Runs the same code as a normal booking, so everything is checked
-- again now; if the seat is gone it fails with class_full and the entry stays (it is armed again).
-- p_replace_class / p_swap_*: what to give up when the weekly limit needs it; they override the entry's own.
create function public.lesson_waitlist_confirm(
  p_region text, p_user_id uuid, p_tz text, p_entry_id bigint,
  p_replace_class uuid default null, p_swap_class uuid default null, p_swap_date date default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  st lessons.students;
  w lessons.waitlist;
  v_replace uuid;
  v_swap_class uuid;
  v_swap_date date;
  v_open int;
  r jsonb;
begin
  if (p_swap_class is null) <> (p_swap_date is null) then
    perform lessons.fail('invalid_request');
  end if;
  perform lessons.lock();
  perform lessons.set_cfg(p_region, p_user_id, p_tz, null);
  select * into w from lessons.waitlist x where x.id = p_entry_id and x.region = p_region and x.user_id = p_user_id;
  if not found then
    perform lessons.fail('not_found');
  end if;
  select * into st from lessons.students s where s.region = p_region and s.user_id = p_user_id;

  if w.kind = 'fixed' then
    v_replace := coalesce(p_replace_class, w.replace_class);
    -- Only give a class up when the weekly limit really needs it, and only one they still have.
    select count(*) into v_open from lessons.enrollments e
    where e.region = p_region and e.user_id = p_user_id and e.class_id <> w.class_id and lessons.is_open(e.class_id, e.to_date);
    if v_open < st.weekly_quota or not exists (
         select 1 from lessons.enrollments e
         where e.region = p_region and e.user_id = p_user_id and e.class_id = v_replace and lessons.is_open(e.class_id, e.to_date)) then
      v_replace := case when v_open < st.weekly_quota then null else p_replace_class end;
    end if;
    r := lessons.enroll_impl(p_region, p_user_id, w.class_id, v_replace, false);
  else
    v_swap_class := coalesce(p_swap_class, w.swap_class);
    v_swap_date := case when p_swap_class is not null then p_swap_date else w.swap_date end;
    -- A lesson they meanwhile gave up some other way is nothing to swap any more: the normal checks decide.
    if v_swap_class is not null and not exists (
         select 1 from lessons.attended(p_region, p_user_id, lessons.occ_start(v_swap_class, v_swap_date), lessons.occ_start(v_swap_class, v_swap_date) + interval '1 second') a
         where a.class_id = v_swap_class and a.ny_date = v_swap_date and a.source = 'standing') then
      v_swap_class := null;
      v_swap_date := null;
    end if;
    r := lessons.move_once_impl(p_region, p_user_id, w.class_id, w.ny_date, v_swap_class, v_swap_date, false);
  end if;

  delete from lessons.waitlist where id = w.id;
  perform lessons.log(p_region, p_user_id, 'waitlist_confirm',
    jsonb_build_object('entry', w.id, 'class_id', w.class_id, 'kind', w.kind, 'ny_date', w.ny_date));
  return r || jsonb_build_object('kind', w.kind);
end;
$$;

-- Teachers see who waits for their classes, admins for all of them.
create function public.lesson_staff_waitlist(p_actor_region text, p_actor_id uuid, p_actor_role text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.require_role(p_actor_role);
  return jsonb_build_object('entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'region', w.region, 'user_id', w.user_id, 'class_id', w.class_id, 'kind', w.kind, 'ny_date', w.ny_date,
      'title', (select v.title from lessons.class_versions v where v.class_id = w.class_id order by v.valid_from desc limit 1),
      'available', lessons.entry_has_room(w), 'created_at', w.created_at) order by w.id)
    from lessons.waitlist w
    where p_actor_role = 'admin' or exists (
      select 1 from lessons.class_versions v
      where v.class_id = w.class_id and v.teacher_region = p_actor_region and v.teacher_id = p_actor_id)), '[]'::jsonb));
end;
$$;

-- ===========================================================================================
-- Grants: every public.lesson_* function is callable by service_role only
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

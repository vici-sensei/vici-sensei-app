-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 6 of docs/LESSON_BOOKING_PLAN.md, section 9: Google
-- Calendar, on top of 20261008143943_lessons_rekey_idempotent.sql.
--
-- A student can ask for their lessons to appear in a Google calendar. The calendar belongs to the APP (a service
-- account owns it) and is shared with the student read-only, so they cannot edit or delete the events. The
-- writer only keeps the book-keeping: which calendar belongs to whom, which Google event stands for which
-- lesson, and whether anything changed since the last sync. The Worker (worker/lib/googleCalendar.ts) does the
-- talking to Google: lesson_google_due says what the calendar should show and what it shows now, the Worker
-- makes the two match and reports back with lesson_google_done.
--
-- "Anything changed" is not tracked per student: every change to a seat, a move, a class, an exception, a
-- vacation or an access bumps a counter on every enabled calendar (deferred triggers, once per transaction).
-- There are few enabled calendars and a sync that finds nothing to do costs no Google call.

-- ===========================================================================================
-- Tables
-- ===========================================================================================

create table lessons.google_calendars (
  region text not null,
  user_id uuid not null,
  enabled boolean not null default false,
  calendar_id text,                     -- Google's id of the calendar the app created for this student
  shared_with text,                     -- the address it was shared with (the account's Gmail)
  dirty_seq bigint not null default 1,  -- bumped by every change that can alter the student's lessons
  synced_seq bigint not null default 0, -- the value of dirty_seq the last successful sync was based on
  synced_at timestamptz,
  claimed_at timestamptz,               -- lease of the Worker run that is syncing it
  last_error text,
  error_count int not null default 0,
  next_try_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (region, user_id),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade
);

-- One Google event per lesson of the student. `hash` says what the event was last written with.
create table lessons.google_events (
  region text not null,
  user_id uuid not null,
  class_id uuid not null,
  ny_date date not null,
  event_id text not null,
  hash text not null,
  ends_at timestamptz not null,
  primary key (region, user_id, class_id, ny_date),
  foreign key (region, user_id) references lessons.google_calendars (region, user_id) on update cascade on delete cascade
);
alter table lessons.google_calendars enable row level security;
alter table lessons.google_events enable row level security;
revoke all on lessons.google_calendars, lessons.google_events from public, anon, authenticated;

-- ===========================================================================================
-- Changes mark the calendars dirty
-- ===========================================================================================

create function lessons.google_dirty_trigger() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('lessons.google_marked', true), '') <> '1' then
    perform set_config('lessons.google_marked', '1', true);
    update lessons.google_calendars set dirty_seq = dirty_seq + 1 where enabled;
  end if;
  return null;
end;
$$;

create constraint trigger google_after_enrollments after insert or update or delete on lessons.enrollments
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_moves after insert or update or delete on lessons.moves
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_extras after insert or update or delete on lessons.extras
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_students after update on lessons.students
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_versions after insert or update or delete on lessons.class_versions
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_overrides after insert or update or delete on lessons.occurrence_overrides
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();
create constraint trigger google_after_vacations after insert or update or delete on lessons.vacations
  deferrable initially deferred for each row execute function lessons.google_dirty_trigger();

-- ===========================================================================================
-- Public RPCs (service_role only; the Worker is the only caller)
-- ===========================================================================================

create function public.lesson_google_state(p_region text, p_user_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, lessons
as $$
  select coalesce(
    (select jsonb_build_object(
       'enabled', g.enabled, 'calendar_id', g.calendar_id, 'shared_with', g.shared_with, 'synced_at', g.synced_at,
       'last_error', g.last_error, 'events', (select count(*) from lessons.google_events e where e.region = g.region and e.user_id = g.user_id))
     from lessons.google_calendars g where g.region = p_region and g.user_id = p_user_id),
    jsonb_build_object('enabled', false, 'calendar_id', null, 'shared_with', null, 'synced_at', null, 'last_error', null, 'events', 0))
$$;

-- The student asks for the calendar (p_email: the address to share it with) or no longer wants it.
create function public.lesson_google_set(p_region text, p_user_id uuid, p_enabled boolean, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  if p_enabled and (p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 254) then
    perform lessons.fail('invalid_email');
  end if;
  perform lessons.lock();
  insert into lessons.students (region, user_id) values (p_region, p_user_id) on conflict do nothing;
  insert into lessons.google_calendars (region, user_id, enabled, shared_with)
  values (p_region, p_user_id, p_enabled, case when p_enabled then p_email end)
  on conflict (region, user_id) do update
    set enabled = excluded.enabled,
        shared_with = case when excluded.enabled then excluded.shared_with else lessons.google_calendars.shared_with end,
        dirty_seq = lessons.google_calendars.dirty_seq + 1,
        last_error = null, error_count = 0, next_try_at = null;
  return public.lesson_google_state(p_region, p_user_id);
end;
$$;

-- The Worker has created the student's calendar in Google.
create function public.lesson_google_set_calendar(p_region text, p_user_id uuid, p_calendar_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  update lessons.google_calendars set calendar_id = p_calendar_id, dirty_seq = dirty_seq + 1
  where region = p_region and user_id = p_user_id;
  if not found then
    perform lessons.fail('not_found');
  end if;
  return public.lesson_google_state(p_region, p_user_id);
end;
$$;

-- The calendar is gone from Google (or was never made): forget everything about it.
create function public.lesson_google_forget(p_region text, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  delete from lessons.google_calendars where region = p_region and user_id = p_user_id;
  return public.lesson_google_state(p_region, p_user_id);
end;
$$;

-- What the Worker has to do: up to p_limit calendars that need a sync (something changed, or six hours have
-- passed so the window of weeks ahead keeps moving), each with what it should show for the next 8 weeks (and
-- yesterday) and what it shows now. A calendar that does not exist in Google yet comes with calendar_id null:
-- the Worker creates it first. Leased for 10 minutes. A calendar that failed is left alone until its retry time.
create function public.lesson_google_due(p_limit int default 5) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  v_rows jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    perform lessons.fail('invalid_limit');
  end if;
  perform lessons.lock();

  with picked as (
    select g.region, g.user_id from lessons.google_calendars g
    where g.enabled
      and (g.claimed_at is null or g.claimed_at <= v_now - interval '10 minutes')
      and (g.next_try_at is null or g.next_try_at <= v_now)
      and (g.dirty_seq > g.synced_seq or g.synced_at is null or g.synced_at <= v_now - interval '6 hours')
    order by g.synced_at nulls first, g.user_id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update lessons.google_calendars g set claimed_at = v_now
    from picked where g.region = picked.region and g.user_id = picked.user_id
    returning g.region, g.user_id, g.calendar_id, g.shared_with, g.dirty_seq
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'region', c.region, 'user_id', c.user_id, 'calendar_id', c.calendar_id, 'shared_with', c.shared_with, 'seq', c.dirty_seq,
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'class_id', a.class_id, 'ny_date', a.ny_date, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
          'title', v.title, 'level', v.level_label, 'meeting_url', coalesce(o.meeting_url, v.meeting_url),
          'hash', md5(concat_ws('|', v.title, v.level_label, a.starts_at, a.ends_at, coalesce(o.meeting_url, v.meeting_url)))
        ) order by a.starts_at), '[]'::jsonb)
      from lessons.attended(c.region, c.user_id, v_now - interval '1 day', v_now + interval '56 days') a
      cross join lateral lessons.version_at(a.class_id, a.ny_date) v
      left join lessons.occurrence_overrides o on o.class_id = a.class_id and o.ny_date = a.ny_date),
    'existing', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'class_id', e.class_id, 'ny_date', e.ny_date, 'event_id', e.event_id, 'hash', e.hash, 'ends_at', e.ends_at)), '[]'::jsonb)
      from lessons.google_events e where e.region = c.region and e.user_id = c.user_id and e.ends_at > v_now - interval '2 days')
  ) order by c.user_id), '[]'::jsonb)
  into v_rows from claimed c;
  return v_rows;
end;
$$;

-- The result of one sync. p_seq is the value the plan was made at: anything that changed since keeps the
-- calendar dirty. p_error not null: it failed (partly or wholly); what did happen is still recorded.
create function public.lesson_google_done(
  p_region text, p_user_id uuid, p_seq bigint, p_upserts jsonb default '[]'::jsonb, p_deleted jsonb default '[]'::jsonb, p_error text default null)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  g lessons.google_calendars;
begin
  perform lessons.lock();
  select * into g from lessons.google_calendars where region = p_region and user_id = p_user_id;
  if not found then
    return;
  end if;
  insert into lessons.google_events (region, user_id, class_id, ny_date, event_id, hash, ends_at)
  select p_region, p_user_id, (u->>'class_id')::uuid, (u->>'ny_date')::date, u->>'event_id', u->>'hash', (u->>'ends_at')::timestamptz
  from jsonb_array_elements(p_upserts) u
  on conflict (region, user_id, class_id, ny_date) do update set event_id = excluded.event_id, hash = excluded.hash, ends_at = excluded.ends_at;
  delete from lessons.google_events e
  using jsonb_array_elements(p_deleted) d
  where e.region = p_region and e.user_id = p_user_id and e.class_id = (d.value->>'class_id')::uuid and e.ny_date = (d.value->>'ny_date')::date;
  -- Old bookkeeping goes: lessons that ended more than a week ago have no event to track any more.
  delete from lessons.google_events e where e.region = p_region and e.user_id = p_user_id and e.ends_at < v_now - interval '7 days';

  if p_error is null then
    update lessons.google_calendars set synced_seq = greatest(synced_seq, p_seq), synced_at = v_now, claimed_at = null,
      last_error = null, error_count = 0, next_try_at = null
    where region = p_region and user_id = p_user_id;
  else
    update lessons.google_calendars set claimed_at = null, last_error = left(p_error, 300), error_count = error_count + 1,
      next_try_at = v_now + make_interval(mins => least(10 * (error_count + 1), 240))
    where region = p_region and user_id = p_user_id;
  end if;
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

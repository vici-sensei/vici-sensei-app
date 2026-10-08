-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 4 of docs/LESSON_BOOKING_PLAN.md: the time-based
-- notifications and everything that delivers them, on top of 20261008103823_lessons_staff_exceptions.sql.
--
--   * reminders 24 h / 1 h / 10 min before a lesson, and daylight-saving warnings 14 / 7 / 2 days before
--     the first lesson whose time on the student's clock shifts (lessons.materialize_due);
--   * the student's switches for the reminders (by reminder and by channel); cancellations, changes and
--     DST warnings are not switchable;
--   * the delivery queue for the Worker (claim / mark, with a lease and retries) and the student's inbox;
--   * lessons.notify now returns whether it stored something, honours the switches, takes an expiry and an
--     "in the inbox" flag.
--
-- Nothing here sends anything by itself: public.lesson_scheduler_tick() only WRITES notification rows
-- (pg_cron calls it every minute where pg_cron exists; the Worker calls it too, which is harmless because
-- every row has a dedup key). The Worker's cron reads the rows that are due and sends the emails.

-- ===========================================================================================
-- Tables
-- ===========================================================================================

alter table lessons.notifications
  add column inapp boolean not null default true,              -- false: the student switched the inbox copy off (email only)
  add column expires_at timestamptz,                           -- a reminder is worthless once the lesson has started
  add column email_attempts smallint not null default 0,
  add column email_next_at timestamptz,                        -- retry not before
  add column email_claimed_at timestamptz;                     -- lease of the Worker that is sending it

alter table lessons.notifications drop constraint notifications_email_state_check;
alter table lessons.notifications add constraint notifications_email_state_check
  check (email_state in ('none', 'pending', 'sending', 'sent', 'failed', 'skipped'));
create index notifications_email_due_idx on lessons.notifications (id) where email_state in ('pending', 'sending');

-- Only what the student changed is stored; everything else is on.
create table lessons.notification_prefs (
  region text not null,
  user_id uuid not null,
  kind text not null check (kind in ('reminder_24h', 'reminder_1h', 'reminder_10m')),
  channel text not null check (channel in ('inapp', 'email', 'push')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (region, user_id, kind, channel),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade
);
alter table lessons.notification_prefs enable row level security;
revoke all on lessons.notification_prefs from public, anon, authenticated;

-- ===========================================================================================
-- Helpers
-- ===========================================================================================

create function lessons.pref_on(p_region text, p_user uuid, p_kind text, p_channel text) returns boolean
language sql stable as $$
  select coalesce(
    (select p.enabled from lessons.notification_prefs p
     where p.region = p_region and p.user_id = p_user and p.kind = p_kind and p.channel = p_channel),
    true)
$$;

-- The student's timezone as it applies at one instant (their saved one; UTC if they never had one).
create function lessons.tz_at(p_region text, p_user uuid, p_at timestamptz) returns text
language sql stable as $$
  select coalesce(
    (select c.tz from lessons.student_week_cfg c
     where c.region = p_region and c.user_id = p_user and c.effective_from <= p_at
     order by c.effective_from desc limit 1),
    'UTC')
$$;

-- notify: the old version returned void and could not tell "stored" from "already stored". The reminders
-- are the only notifications the student may switch off (per channel); if every channel is off nothing
-- is stored at all.
drop function lessons.notify(text, uuid, text, text, text, text, jsonb, boolean);
create function lessons.notify(
  p_region text, p_user uuid, p_kind text, p_dedup text, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb, p_email boolean default true, p_expires timestamptz default null)
returns boolean
language plpgsql as $$
declare
  v_inapp boolean := true;
  v_email boolean := p_email;
  v_rows int;
begin
  if p_kind like 'reminder\_%' then
    v_inapp := lessons.pref_on(p_region, p_user, p_kind, 'inapp');
    v_email := p_email and lessons.pref_on(p_region, p_user, p_kind, 'email');
    if not (v_inapp or v_email) then
      return false;
    end if;
  end if;
  insert into lessons.notifications (region, user_id, kind, dedup_key, title, body, data, inapp, expires_at, email_state)
  values (p_region, p_user, p_kind, p_dedup, p_title, p_body, p_data, v_inapp, p_expires,
          case when v_email then 'pending' else 'none' end)
  on conflict (region, user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- "1 hour", "2 hours", "30 minutes"
create function lessons.fmt_shift(p_minutes int) returns text
language sql immutable as $$
  select case
    when abs(p_minutes) % 60 = 0 then (abs(p_minutes) / 60)::text || case when abs(p_minutes) = 60 then ' hour' else ' hours' end
    else abs(p_minutes)::text || ' minutes'
  end
$$;

-- ===========================================================================================
-- The materializer: reminders and DST warnings
-- ===========================================================================================

-- Looks at every lesson that starts in the next 14 days and, for each student attending it, stores what
-- is due NOW. Safe to run as often as you like: the dedup key makes a second run a no-op.
--
-- Reminders: the tightest reminder whose moment has passed (a student who books a lesson 5 minutes before
-- it gets the 10-minute one, not three at once); never for a lesson that has started. The key carries
-- the lesson's start instant, so a lesson that was moved gets its reminders again, at the new time.
--
-- DST warnings: a lesson "shifts" when, in the student's timezone, its wall-clock time differs from the
-- same class one week earlier (the New York time of a class never changes; the student's does when
-- New York or their country changes its clocks). Lessons moved by a teacher or whose class changed time
-- are not DST. Warned at 14, 7 and 2 days before the first shifted lesson, only the stage we are in.
create function lessons.materialize_due() returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := lessons.now();
  v_today date := (v_now at time zone 'America/New_York')::date;
  o record;
  a record;
  p record;
  v_level text;
  v_title text;
  v_body text;
  v_lvl int;
  v_tz text;
  v_shift int;
  v_ny_changed boolean;
  v_stu_changed boolean;
  v_cause text;
  v_url text;
  v_local text;
  v_reminders int := 0;
  v_dst int := 0;
begin
  for o in
    select c.id as class_id, d.ny_date, v.title, v.start_time, s.start_at,
           coalesce(ov.meeting_url, v.meeting_url) as meeting_url
    from lessons.classes c
    cross join lateral generate_series((v_today - 7)::timestamp, (v_today + 16)::timestamp, interval '1 day') g
    cross join lateral (select g::date as ny_date) d
    cross join lateral lessons.version_at(c.id, d.ny_date) v
    cross join lateral (select lessons.occ_start(c.id, d.ny_date) as start_at) s
    left join lessons.occurrence_overrides ov on ov.class_id = c.id and ov.ny_date = d.ny_date
    where s.start_at is not null and s.start_at > v_now and s.start_at <= v_now + interval '336 hours'
  loop
    for a in select * from lessons.occ_attendees(o.class_id, o.ny_date) loop
      v_local := lessons.fmt_local(o.start_at, a.region, a.user_id);

      -- reminders ------------------------------------------------------------------------------------------
      if o.start_at - interval '24 hours' <= v_now then
        v_level := case
          when o.start_at - interval '10 minutes' <= v_now then 'reminder_10m'
          when o.start_at - interval '1 hour' <= v_now then 'reminder_1h'
          else 'reminder_24h' end;
        v_title := case v_level
          when 'reminder_10m' then 'Your lesson starts in about 10 minutes'
          when 'reminder_1h' then 'Your lesson starts in about an hour'
          else 'Your lesson is coming up' end;
        v_body := format('"%s" starts %s your time.', o.title, v_local);
        if v_level = 'reminder_10m' and o.meeting_url is not null then
          v_body := v_body || ' Join here: ' || o.meeting_url;
        end if;
        if lessons.notify(
             a.region, a.user_id, v_level,
             format('rem:%s:%s:%s:%s', o.class_id, o.ny_date, v_level, extract(epoch from o.start_at)::bigint),
             v_title, v_body,
             jsonb_build_object('class_id', o.class_id, 'ny_date', o.ny_date, 'starts_at', o.start_at, 'meeting_url', o.meeting_url),
             true, o.start_at)
        then
          v_reminders := v_reminders + 1;
        end if;
      end if;

      -- daylight-saving warnings ---------------------------------------------------------------------------
      v_lvl := case
        when o.start_at - v_now <= interval '48 hours' then 2
        when o.start_at - v_now <= interval '168 hours' then 7
        else 14 end;
      select * into p from lessons.version_at(o.class_id, o.ny_date - 7);
      if found and p.start_time = o.start_time
         and o.start_at = ((o.ny_date + o.start_time) at time zone 'America/New_York')
      then
        declare
          v_prev timestamptz := ((o.ny_date - 7) + p.start_time) at time zone 'America/New_York';
        begin
          v_tz := lessons.tz_at(a.region, a.user_id, o.start_at);
          v_shift := (extract(epoch from ((o.start_at at time zone v_tz) - (v_prev at time zone v_tz) - interval '7 days')) / 60)::int;
          if v_shift <> 0 then
            v_ny_changed := ((o.start_at at time zone 'America/New_York') - (o.start_at at time zone 'UTC'))
                         <> ((v_prev at time zone 'America/New_York') - (v_prev at time zone 'UTC'));
            v_stu_changed := ((o.start_at at time zone v_tz) - (o.start_at at time zone 'UTC'))
                          <> ((v_prev at time zone v_tz) - (v_prev at time zone 'UTC'));
            v_cause := case
              when v_ny_changed and v_stu_changed then format('daylight saving time changes in both the United States and your timezone (%s)', v_tz)
              when v_ny_changed then 'daylight saving time changes in the United States'
              when v_stu_changed then format('daylight saving time changes in your timezone (%s)', v_tz)
              else null end;
            if v_cause is not null then
              if lessons.notify(
                   a.region, a.user_id, 'dst_warning',
                   format('dst:%s:%s:%s', o.class_id, o.ny_date, v_lvl),
                   'Your lesson time changes',
                   format('"%s" on %s (your time) will be %s %s than the week before (%s), because %s. The time in New York does not change.',
                          o.title, v_local,
                          lessons.fmt_shift(v_shift), case when v_shift < 0 then 'earlier' else 'later' end,
                          to_char(v_prev at time zone v_tz, 'FMDy FMDD FMMon, HH24:MI'), v_cause),
                   jsonb_build_object('class_id', o.class_id, 'ny_date', o.ny_date, 'starts_at', o.start_at,
                                      'shift_minutes', v_shift, 'days_ahead', v_lvl),
                   true)
              then
                v_dst := v_dst + 1;
              end if;
            end if;
          end if;
        end;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('reminders', v_reminders, 'dst_warnings', v_dst);
end;
$$;

-- ===========================================================================================
-- Public RPCs (service_role only; the Worker is the only caller)
-- ===========================================================================================

-- What pg_cron and the Worker call. Takes the global lock so it never interleaves with a booking.
create function public.lesson_scheduler_tick() returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_made jsonb;
  v_purged int;
begin
  perform lessons.lock();
  v_made := lessons.materialize_due();
  -- Housekeeping: a notice nobody has to act on any more is dropped after half a year.
  delete from lessons.notifications
  where created_at < lessons.now() - interval '180 days' and email_state in ('none', 'sent', 'skipped', 'failed');
  get diagnostics v_purged = row_count;
  return v_made || jsonb_build_object('purged', v_purged);
end;
$$;

-- ---- the student's inbox ------------------------------------------------------------------------------------------

create function public.lesson_notifications_list(p_region text, p_user_id uuid, p_limit int default 30, p_before bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, lessons
as $$
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    perform lessons.fail('invalid_limit');
  end if;
  return jsonb_build_object(
    'unread', (select count(*) from lessons.notifications n
               where n.region = p_region and n.user_id = p_user_id and n.inapp and n.read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'kind', x.kind, 'title', x.title, 'body', x.body, 'data', x.data,
               'created_at', x.created_at, 'read_at', x.read_at) order by x.id desc)
      from (
        select * from lessons.notifications n
        where n.region = p_region and n.user_id = p_user_id and n.inapp
          and (p_before is null or n.id < p_before)
        order by n.id desc limit p_limit
      ) x), '[]'::jsonb));
end;
$$;

-- p_ids null = everything.
create function public.lesson_notifications_mark_read(p_region text, p_user_id uuid, p_ids bigint[] default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  update lessons.notifications n set read_at = lessons.now()
  where n.region = p_region and n.user_id = p_user_id and n.read_at is null and n.inapp
    and (p_ids is null or n.id = any (p_ids));
  return jsonb_build_object('unread', (
    select count(*) from lessons.notifications n
    where n.region = p_region and n.user_id = p_user_id and n.inapp and n.read_at is null));
end;
$$;

-- ---- reminder switches -------------------------------------------------------------------------------------------

create function public.lesson_notification_prefs_get(p_region text, p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, lessons
as $$
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  return jsonb_build_object('prefs', (
    select jsonb_agg(jsonb_build_object('kind', k.kind, 'channel', c.channel, 'enabled', lessons.pref_on(p_region, p_user_id, k.kind, c.channel))
                     order by k.ord, c.ord)
    from (values ('reminder_24h', 1), ('reminder_1h', 2), ('reminder_10m', 3)) k(kind, ord)
    cross join (values ('inapp', 1), ('email', 2), ('push', 3)) c(channel, ord)));
end;
$$;

-- p_prefs: [{"kind": "reminder_1h", "channel": "email", "enabled": false}, ...]. Anything that is not one
-- of the three reminders is refused: the other notifications cannot be switched off.
create function public.lesson_notification_prefs_set(p_region text, p_user_id uuid, p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  r record;
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'array' or jsonb_array_length(p_prefs) > 20 then
    perform lessons.fail('invalid_prefs');
  end if;
  for r in select * from jsonb_array_elements(p_prefs) loop
    if jsonb_typeof(r.value) <> 'object'
       or coalesce(r.value->>'kind', '') not in ('reminder_24h', 'reminder_1h', 'reminder_10m')
       or coalesce(r.value->>'channel', '') not in ('inapp', 'email', 'push')
       or jsonb_typeof(r.value->'enabled') is distinct from 'boolean' then
      perform lessons.fail('invalid_prefs');
    end if;
  end loop;

  perform lessons.lock();
  insert into lessons.students (region, user_id) values (p_region, p_user_id) on conflict do nothing;
  insert into lessons.notification_prefs (region, user_id, kind, channel, enabled)
  select p_region, p_user_id, e.value->>'kind', e.value->>'channel', (e.value->>'enabled')::boolean
  from jsonb_array_elements(p_prefs) e
  on conflict (region, user_id, kind, channel) do update set enabled = excluded.enabled, updated_at = now();
  return public.lesson_notification_prefs_get(p_region, p_user_id);
end;
$$;

-- ---- delivery queue for the Worker -----------------------------------------------------------------------------------

-- Hands out up to p_limit emails to send and leases them for 10 minutes: a second Worker run, or a retry
-- after a crash, does not send the same one twice at once, and a lease that was never settled is taken
-- again. Reminders that are too late to matter are dropped here.
create function public.lesson_notifications_due(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  v_rows jsonb;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    perform lessons.fail('invalid_limit');
  end if;

  update lessons.notifications set email_state = 'skipped'
  where email_state in ('pending', 'sending') and expires_at is not null and expires_at <= v_now;

  with picked as (
    select n.id from lessons.notifications n
    where (n.email_state = 'pending' and (n.email_next_at is null or n.email_next_at <= v_now))
       or (n.email_state = 'sending' and n.email_claimed_at <= v_now - interval '10 minutes')
    order by n.id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update lessons.notifications n
    set email_state = 'sending', email_claimed_at = v_now
    from picked where n.id = picked.id
    returning n.id, n.region, n.user_id, n.kind, n.title, n.body, n.data, n.created_at, n.email_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'region', c.region, 'user_id', c.user_id, 'kind', c.kind, 'title', c.title,
           'body', c.body, 'data', c.data, 'created_at', c.created_at, 'attempts', c.email_attempts) order by c.id), '[]'::jsonb)
  into v_rows from claimed c;
  return v_rows;
end;
$$;

-- p_result: 'sent'; 'skipped' (nowhere to send it, e.g. no address); 'retry' (a temporary failure of this
-- message: tried again after a pause, five times at most); 'failed' (permanent); 'release' (the Worker could
-- not reach or log in to the mail server: not the message's fault, so it goes back to the queue without
-- counting as an attempt).
create function public.lesson_notification_mark(p_id bigint, p_channel text, p_result text, p_error text default null)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  v_attempts smallint;
begin
  if p_channel <> 'email' then
    perform lessons.fail('invalid_channel');
  end if;
  if p_result not in ('sent', 'skipped', 'retry', 'failed', 'release') then
    perform lessons.fail('invalid_result');
  end if;
  select email_attempts into v_attempts from lessons.notifications where id = p_id and email_state = 'sending';
  if not found then
    return;     -- lease expired and somebody else settled it, or it was dropped: nothing to do
  end if;
  if p_result = 'retry' and v_attempts + 1 >= 5 then
    p_result := 'failed';
  end if;
  update lessons.notifications set
    email_state = case p_result when 'sent' then 'sent' when 'skipped' then 'skipped' when 'failed' then 'failed' else 'pending' end,
    email_sent_at = case when p_result = 'sent' then v_now else email_sent_at end,
    email_attempts = case when p_result in ('retry', 'failed') then email_attempts + 1 else email_attempts end,
    email_next_at = case p_result
      when 'retry' then v_now + make_interval(mins => 10 * (v_attempts + 1))
      when 'release' then v_now + interval '10 minutes'
      else null end,
    email_claimed_at = null,
    email_error = left(p_error, 300)
  where id = p_id;
end;
$$;

-- ===========================================================================================
-- Grants (every public.lesson_* is service_role only) and the schedule
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

-- Every minute where pg_cron exists (the project has it; a plain Postgres, as in the local tests, does not).
-- cron.schedule upserts by name.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('lessons-scheduler', '* * * * *', 'select public.lesson_scheduler_tick()');
  end if;
end;
$$;

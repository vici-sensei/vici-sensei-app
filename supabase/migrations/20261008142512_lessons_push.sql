-- EU-new ONLY (the lesson writer, schema `lessons`). Stage 5b of docs/LESSON_BOOKING_PLAN.md: web push, on top of
-- 20261008115636_lessons_waitlist.sql.
--
-- A student can turn push on for each device (browser or installed app): the browser gives an endpoint plus
-- two keys, stored in lessons.push_subscriptions. Every notice that is sent by email is sent by push too
-- (the reminders follow the student's per-channel switches), to every device they subscribed. The Worker
-- reads the queue (lesson_push_due, with a 10 minute lease like the email queue), encrypts and posts the
-- message to each device's push service, and reports back (lesson_push_mark): a device the push service says
-- is gone (404 / 410) is deleted here.

-- ===========================================================================================
-- Tables
-- ===========================================================================================

create table lessons.push_subscriptions (
  id bigint generated always as identity primary key,
  region text not null,
  user_id uuid not null,
  endpoint text not null unique check (char_length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 80 and 100),     -- the device's public key, 65 bytes in base64url
  auth text not null check (char_length(auth) between 20 and 30),          -- the device's auth secret, 16 bytes in base64url
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  foreign key (region, user_id) references lessons.students (region, user_id) on update cascade on delete cascade
);
create index push_subscriptions_student_idx on lessons.push_subscriptions (region, user_id);
alter table lessons.push_subscriptions enable row level security;
revoke all on lessons.push_subscriptions from public, anon, authenticated;

alter table lessons.notifications
  add column push_attempts smallint not null default 0,
  add column push_next_at timestamptz,
  add column push_claimed_at timestamptz,
  add column push_error text;
alter table lessons.notifications drop constraint notifications_push_state_check;
alter table lessons.notifications add constraint notifications_push_state_check
  check (push_state in ('none', 'pending', 'sending', 'sent', 'failed', 'skipped'));
create index notifications_push_due_idx on lessons.notifications (id) where push_state in ('pending', 'sending');

-- ===========================================================================================
-- notify: push too
-- ===========================================================================================

-- Same signature as before (so this replaces it). A notice is pushed when it is email-worthy (p_email) and the
-- student has at least one device subscribed; the reminders also follow the student's "push" switch, and a
-- reminder with every channel switched off is not stored at all.
create or replace function lessons.notify(
  p_region text, p_user uuid, p_kind text, p_dedup text, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb, p_email boolean default true, p_expires timestamptz default null)
returns boolean
language plpgsql as $$
declare
  v_inapp boolean := true;
  v_email boolean := p_email;
  v_push boolean := p_email;
  v_rows int;
begin
  if p_kind like 'reminder\_%' then
    v_inapp := lessons.pref_on(p_region, p_user, p_kind, 'inapp');
    v_email := p_email and lessons.pref_on(p_region, p_user, p_kind, 'email');
    v_push := p_email and lessons.pref_on(p_region, p_user, p_kind, 'push');
  end if;
  v_push := v_push and exists (select 1 from lessons.push_subscriptions s where s.region = p_region and s.user_id = p_user);
  if not (v_inapp or v_email or v_push) then
    return false;
  end if;
  insert into lessons.notifications (region, user_id, kind, dedup_key, title, body, data, inapp, expires_at, email_state, push_state)
  values (p_region, p_user, p_kind, p_dedup, p_title, p_body, p_data, v_inapp, p_expires,
          case when v_email then 'pending' else 'none' end,
          case when v_push then 'pending' else 'none' end)
  on conflict (region, user_id, dedup_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ===========================================================================================
-- Public RPCs (service_role only; the Worker is the only caller)
-- ===========================================================================================

-- One device. The same endpoint always belongs to one student (it is the device's address): subscribing it
-- again, even as someone else, moves it. At most 5 devices per student; the oldest go first.
create function public.lesson_push_subscribe(
  p_region text, p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_count int;
begin
  if p_region not in ('eu', 'us') then
    perform lessons.fail('invalid_region');
  end if;
  perform lessons.lock();
  insert into lessons.students (region, user_id) values (p_region, p_user_id) on conflict do nothing;
  insert into lessons.push_subscriptions (region, user_id, endpoint, p256dh, auth, user_agent)
  values (p_region, p_user_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set region = excluded.region, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
  delete from lessons.push_subscriptions s
  where s.region = p_region and s.user_id = p_user_id
    and s.id not in (select x.id from lessons.push_subscriptions x where x.region = p_region and x.user_id = p_user_id
                     order by x.created_at desc, x.id desc limit 5);
  select count(*) into v_count from lessons.push_subscriptions s where s.region = p_region and s.user_id = p_user_id;
  return jsonb_build_object('count', v_count);
end;
$$;

create function public.lesson_push_unsubscribe(p_region text, p_user_id uuid, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
begin
  perform lessons.lock();
  delete from lessons.push_subscriptions s where s.region = p_region and s.user_id = p_user_id and s.endpoint = p_endpoint;
  return jsonb_build_object('count', (select count(*) from lessons.push_subscriptions s where s.region = p_region and s.user_id = p_user_id));
end;
$$;

-- How many devices the student has, and whether this one is among them.
create function public.lesson_push_state(p_region text, p_user_id uuid, p_endpoint text default null) returns jsonb
language sql stable security definer set search_path = pg_catalog, lessons
as $$
  select jsonb_build_object(
    'count', count(*),
    'this_device', coalesce(bool_or(s.endpoint = p_endpoint), false))
  from lessons.push_subscriptions s where s.region = p_region and s.user_id = p_user_id
$$;

-- Hands out up to p_limit pushes to send and leases them for 10 minutes. Each comes with the student's
-- devices. Pushes that are too late to matter, or for a student with no device left, are dropped here.
create function public.lesson_push_due(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  v_rows jsonb;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    perform lessons.fail('invalid_limit');
  end if;

  update lessons.notifications set push_state = 'skipped'
  where push_state in ('pending', 'sending') and expires_at is not null and expires_at <= v_now;
  update lessons.notifications n set push_state = 'skipped'
  where n.push_state in ('pending', 'sending')
    and not exists (select 1 from lessons.push_subscriptions s where s.region = n.region and s.user_id = n.user_id);

  with picked as (
    select n.id from lessons.notifications n
    where (n.push_state = 'pending' and (n.push_next_at is null or n.push_next_at <= v_now))
       or (n.push_state = 'sending' and n.push_claimed_at <= v_now - interval '10 minutes')
    order by n.id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update lessons.notifications n
    set push_state = 'sending', push_claimed_at = v_now
    from picked where n.id = picked.id
    returning n.id, n.region, n.user_id, n.kind, n.title, n.body, n.data, n.created_at, n.push_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'region', c.region, 'user_id', c.user_id, 'kind', c.kind, 'title', c.title, 'body', c.body,
           'data', c.data, 'created_at', c.created_at, 'attempts', c.push_attempts,
           'devices', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth) order by s.id), '[]'::jsonb)
                       from lessons.push_subscriptions s where s.region = c.region and s.user_id = c.user_id)) order by c.id), '[]'::jsonb)
  into v_rows from claimed c;
  return v_rows;
end;
$$;

-- p_result as for the email queue: 'sent'; 'skipped'; 'retry' (a device's push service had a temporary
-- problem: tried again after a pause, five times at most); 'failed'; 'release' (could not even try, e.g. the
-- keys are not set: no attempt counted). p_gone: devices the push service said no longer exist (404 / 410):
-- they are deleted.
create function public.lesson_push_mark(p_id bigint, p_result text, p_error text default null, p_gone text[] default null)
returns void
language plpgsql security definer set search_path = pg_catalog, lessons
as $$
declare
  v_now timestamptz := lessons.now();
  n lessons.notifications;
begin
  if p_result not in ('sent', 'skipped', 'retry', 'failed', 'release') then
    perform lessons.fail('invalid_result');
  end if;
  select * into n from lessons.notifications where id = p_id and push_state = 'sending';
  if not found then
    return;     -- the lease expired and somebody else settled it, or it was dropped
  end if;
  if p_gone is not null then
    delete from lessons.push_subscriptions s where s.region = n.region and s.user_id = n.user_id and s.endpoint = any (p_gone);
  end if;
  if p_result = 'retry' and n.push_attempts + 1 >= 5 then
    p_result := 'failed';
  end if;
  update lessons.notifications set
    push_state = case p_result when 'sent' then 'sent' when 'skipped' then 'skipped' when 'failed' then 'failed' else 'pending' end,
    push_sent_at = case when p_result = 'sent' then v_now else push_sent_at end,
    push_attempts = case when p_result in ('retry', 'failed') then push_attempts + 1 else push_attempts end,
    push_next_at = case p_result
      when 'retry' then v_now + make_interval(mins => 10 * (n.push_attempts + 1))
      when 'release' then v_now + interval '10 minutes'
      else null end,
    push_claimed_at = null,
    push_error = left(p_error, 300)
  where id = p_id;
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

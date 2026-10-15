-- Both live projects (EU-new + US-new), identical text. The region parity check of /admin/kanji-words reads a cache
-- instead of reaching the other region on every page load.
--
-- Why: after 20261015160558_kanji_words_parity_stats_view.sql one remote read costs ~0.46 s with the postgres_fdw
-- link already open, but ~1.7 s when the PostgREST connection has to open it (TCP + TLS + SCRAM + session SETs across
-- the ocean), which is most page loads on a quiet region (seen 1.95-2.4 s on US). Now the cron job
-- kanji-words-parity (every 2 minutes, on each region) stores both sides' stats, read in the same run, and
-- admin_kanji_words_parity() only reads that row.
--
-- A single mismatch can be a save landing between the two reads of a run (writes reach both regions in one
-- transaction, the two reads are ~0.5 s apart), so the RPC reports in_sync false only after two runs in a row disagree:
-- real drift shows within 2-4 minutes, and a passing save never raises the banner. If the row is missing or older than
-- 15 minutes (the job stopped), the RPC checks live, as before.

create table if not exists public.kanji_words_parity_cache (
  id boolean primary key default true check (id),
  checked_at timestamptz not null,
  local jsonb not null,
  remote jsonb,
  error text,
  -- Consecutive runs whose two sides disagreed (0 = the last run agreed).
  mismatches integer not null default 0
);

alter table public.kanji_words_parity_cache enable row level security;
revoke all on table public.kanji_words_parity_cache from public, anon, authenticated;

-- Both sides, read now (the old body of admin_kanji_words_parity(), without the admin check).
create or replace function public.kw_parity_live()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  s text;
  v_local jsonb;
  v_remote jsonb;
begin
  s := public.kw_remote_schema();
  v_local := public.kw_stats('public');

  if s is null or to_regclass(format('%I.kanji_detail_words', s)) is null
     or to_regclass(format('%I.kanji_word_overrides', s)) is null
     or to_regclass(format('%I.kanji_word_review', s)) is null
     or to_regclass(format('%I.kanji_word_history', s)) is null
     or to_regclass(format('%I.kanji_words_parity_stats', s)) is null then
    return jsonb_build_object('in_sync', null, 'error', 'kanji_words_remote_missing', 'local', v_local);
  end if;

  v_remote := public.kw_stats(s);
  return jsonb_build_object(
    'in_sync',
      (v_local->'final_hash') = (v_remote->'final_hash')
      and (v_local->'overrides_hash') is not distinct from (v_remote->'overrides_hash')
      and (v_local->'version_sum') = (v_remote->'version_sum')
      and (v_local->'reviewed') = (v_remote->'reviewed'),
    'local', v_local,
    'remote', v_remote
  );
end;
$function$;

-- Run by the cron job. A failure (other region unreachable) leaves the old row, which goes stale and makes the RPC
-- check live; cron.job_run_details keeps the error.
create or replace function public.kw_parity_refresh()
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v jsonb := public.kw_parity_live();
begin
  insert into public.kanji_words_parity_cache as c (id, checked_at, local, remote, error, mismatches)
  values (true, clock_timestamp(), v->'local', v->'remote', v->>'error',
          case when (v->>'in_sync')::boolean is false then 1 else 0 end)
  on conflict (id) do update set
    checked_at = excluded.checked_at,
    local = excluded.local,
    remote = excluded.remote,
    error = excluded.error,
    mismatches = case when excluded.mismatches = 0 then 0 else c.mismatches + 1 end;
end;
$function$;

revoke all on function public.kw_parity_live() from public, anon, authenticated;
revoke all on function public.kw_parity_refresh() from public, anon, authenticated;

-- Same signature and grants; 'checked_at' and 'cached' are new keys (the page reads only in_sync).
create or replace function public.admin_kanji_words_parity()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.kanji_words_parity_cache;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into c from public.kanji_words_parity_cache where id;
  if not found or c.checked_at < now() - interval '15 minutes' then
    return public.kw_parity_live() || jsonb_build_object('checked_at', now(), 'cached', false);
  end if;

  if c.error is not null then
    return jsonb_build_object('in_sync', null, 'error', c.error, 'local', c.local,
                              'checked_at', c.checked_at, 'cached', true);
  end if;
  return jsonb_build_object(
    'in_sync', c.mismatches < 2,
    'mismatches', c.mismatches,
    'local', c.local,
    'remote', c.remote,
    'checked_at', c.checked_at,
    'cached', true
  );
end;
$function$;

select public.kw_parity_refresh();

select cron.schedule('kanji-words-parity', '*/2 * * * *', $$select public.kw_parity_refresh()$$);

-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Closes a race that let a user receive more new kanji/vocab cards per day than
-- user_study_settings.new_kanji_per_day / new_vocab_per_day allow.
--
-- introduceKanji()/introduceVocabulary() (lib/data/introduce.ts) previously did a
-- plain "check it doesn't already exist, then insert" from the client -- nothing
-- ever checked the *daily count* at insert time. The daily cap was only enforced
-- on the read side, by how many candidates fetchStudyQueue() asked
-- get_new_kanji_candidates()/get_new_vocab_candidates() for (lib/data/studyQueue.ts).
-- That read happens on a ~45s poll (useStudyQueue.ts) independent of whether a
-- just-fired introduce mutation has actually committed yet, so a poll landing in
-- that window would see yesterday's (pre-insert) count, decide there was still
-- room, and hand back a new candidate -- which the client would introduce,
-- uncapped, for as long as the race kept re-opening.
--
-- introduce_kanji()/introduce_vocabulary() replace that with a single atomic
-- transaction: lock on (kind, user_id) so concurrent calls for the same user
-- serialize instead of racing, recount today's introductions from the source of
-- truth, and only then insert -- so the cap is enforced by the database itself,
-- not by however fresh the client's last poll happened to be.
--
-- p_day_start/p_day_end are computed the same way the read-side count already is
-- (lib/srs/day.ts's utcDayBounds, using the browser's IANA timezone) -- this
-- function trusts them the same way the existing read path already does.

create or replace function public.introduce_kanji(
  p_user_id uuid,
  p_kanji_id bigint,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_kanji:' || p_user_id::text));

  select new_kanji_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_kanji_meaning_progress
  where user_id = p_user_id
    and created_at >= p_day_start
    and created_at < p_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new kanji limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_kanji_meaning_progress
    where user_id = p_user_id and kanji_id = p_kanji_id
  ) then
    raise exception 'This kanji has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_kanji_meaning_progress (user_id, kanji_id, session_id, status, due_at)
  values (p_user_id, p_kanji_id, p_session_id, 'learning', now() + interval '1 minute');

  insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
  select p_user_id, p_kanji_id, kw.kanji_word_id, 'learning', now() + interval '1 minute'
  from public.get_kanji_detail_words(p_kanji_id) kw;
end;
$function$;

grant execute on function public.introduce_kanji(uuid, bigint, timestamptz, timestamptz, bigint) to authenticated;

create or replace function public.introduce_vocabulary(
  p_user_id uuid,
  p_word_id bigint,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_vocabulary:' || p_user_id::text));

  select new_vocab_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_vocabulary_progress
  where user_id = p_user_id
    and created_at >= p_day_start
    and created_at < p_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new word limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_vocabulary_progress
    where user_id = p_user_id and word_id = p_word_id
  ) then
    raise exception 'This word has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_vocabulary_progress (user_id, word_id, session_id, status, due_at)
  values (p_user_id, p_word_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

grant execute on function public.introduce_vocabulary(uuid, bigint, timestamptz, timestamptz, bigint) to authenticated;

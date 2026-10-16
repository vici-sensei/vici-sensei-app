-- EU-new + US-new BOTH, identical text. The green circle of the /admin/kanji-words editor marks the kanji as reviewed
-- (or takes the mark away) the moment it is pressed, instead of the mark riding along with the next "Save"; the red
-- circle now only saves the word list (the page calls admin_save_kanji_words with p_reviewed null).
--
-- admin_set_kanji_reviewed(p_kanji_id, p_reviewed, p_expected_version): admins only. Goes through the same write path
-- as every other kanji-words change (kw_commit + kw_push from 20261007064452_kanji_words_admin_rpcs.sql): the kanji's
-- overrides stay exactly as they are (what the bulk "review" op does), the version check refuses a stale page with
-- kanji_words_conflict, the version goes up by one, one history row of kind 'review' (no batch, so it doesn't show
-- as a bulk change to undo) records it, and both regions are written in the same transaction. Marking sets
-- reviewed_at / reviewed_by and the algorithm list the review saw; unmarking keeps them, like the bulk op. Asking
-- for the state the kanji is already in writes no version and no history row (changed false).
--
-- Errors (message text): kanji_words_conflict (SQLSTATE 40001), kanji_words_unknown_kanji,
-- kanji_words_remote_missing.

create or replace function public.admin_set_kanji_reviewed(
  p_kanji_id bigint,
  p_reviewed boolean,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  s record;
  v_res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_reviewed is null then
    raise exception 'kanji_words_reviewed_required' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'kanji_words_expected_version_required' using errcode = '22023';
  end if;

  v_email := (select u.email from public.users u where u.id = v_uid);
  select * into s from public.kw_state(p_kanji_id);

  v_res := public.kw_commit(
    p_kanji_id, s.add_ids, s.remove_ids, p_reviewed, null, false,
    'review', null, null, null, p_expected_version, v_uid, v_email, false);

  if (v_res->>'changed')::boolean then
    perform public.kw_push(array[p_kanji_id], array[(v_res->>'history_id')::uuid]);
  end if;
  return v_res || jsonb_build_object('reviewed', p_reviewed);
end;
$function$;

revoke all on function public.admin_set_kanji_reviewed(bigint, boolean, integer) from public, anon, authenticated;
grant execute on function public.admin_set_kanji_reviewed(bigint, boolean, integer) to authenticated;

-- EU-new + US-new BOTH, identical text. Read-only: lets /admin/words and its word page (/admin/words/edit, the pencil
-- on a row) show which words are marked as reviewed. Until now the marks (vocabulary_review, closed to anon /
-- authenticated) only reached the page through admin_get_kanji_word_candidates, i.e. one kanji's words at a time, so a
-- word without kanji (テレビ) could never show its mark.
--
-- admin_get_vocabulary_reviews(p_vocabulary_ids): the marks of those words, or of every marked word when null. Admins
-- only. Reads this region's table only: admin_set_vocabulary_reviewed writes both regions in one transaction, so they
-- always hold the same marks. Returns a jsonb array of {id, at, by} (by = the admin's email, null if gone), in id order;
-- a word with no mark is simply not in it. Changes no data.

create or replace function public.admin_get_vocabulary_reviews(p_vocabulary_ids bigint[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.vocabulary_id,
      'at', r.reviewed_at,
      'by', r.reviewed_by_email) order by r.vocabulary_id)
    from public.vocabulary_review r
    where p_vocabulary_ids is null or r.vocabulary_id = any(p_vocabulary_ids)), '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_get_vocabulary_reviews(bigint[]) from public, anon, authenticated;
grant execute on function public.admin_get_vocabulary_reviews(bigint[]) to authenticated;

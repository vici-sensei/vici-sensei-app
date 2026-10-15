-- Both live projects (EU + US), identical text. Follow-up to 20261015183526_kanji_reading_unlocks.sql
-- (docs/READING_UNLOCK_PLAN.md), found testing it in the app the same day.
--
-- Reviews only ever come from the student's enabled levels (get_eligible_due_rows: kanji level in
-- user_study_settings.enabled_levels -- "Also study lower levels" off at N4 means no N5 kanji
-- reviews). The unlock side ignored that: a student who picked N4 alone still got a "Reading
-- unlock" card for an N5 kanji's N3 word, whose Word reading card would then never come back for
-- review -- and that word counted toward their N4 progress, so they could never finish N4.
--
-- Now a locked word only unlocks, and only counts toward a level's progress, while its kanji's
-- level is enabled. After an automatic level-up the lower levels stay enabled
-- (check_and_advance_jlpt_level sets include_lower_levels), so the normal path is unchanged.

-- Same as in 20261015183526, plus: the kanji's level is one of the student's enabled levels.
create or replace function public.unlockable_kanji_readings(p_user_id uuid)
returns table(kanji_id bigint, kanji_word_id bigint, created_at timestamp with time zone)
language sql
stable
as $function$
  with u as (select public.user_jlpt_rank(p_user_id) as r)
  select q.kanji_id, q.kanji_word_id, q.created_at
  from public.user_kanji_reading_pending q
  join public.kanji k on k.id = q.kanji_id
  join public.kanji_word kw on kw.id = q.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  join public.user_kanji_meaning_progress m on m.user_id = q.user_id and m.kanji_id = q.kanji_id
  join public.user_study_settings s on s.user_id = q.user_id and k.level = any(s.enabled_levels)
  cross join u
  where q.user_id = p_user_id
    and q.unlocked_at is null
    and v.study_enabled
    and m.status <> 'suspended'
    and not public.kanji_word_is_locked(public.kanji_word_unlock_rank(k.level, v.jlpt_level), u.r);
$function$;

-- Same as in 20261015183526, except the kanji_reading total's locked-word part also requires the
-- kanji's level to be enabled (same rule as unlockable_kanji_readings above).
create or replace function public.get_level_progress(p_user_id uuid, p_level text)
returns table(category text, seen bigint, learned bigint, total bigint)
language sql
stable
as $function$
  select 'kanji'::text as category,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level) as seen,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji where level = p_level) as total

  union all

  select 'kanji_reading'::text,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       join public.kanji_word kw on kw.id = p.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where p.user_id = p_user_id
         and coalesce(public.kanji_word_unlock_rank(k.level, v.jlpt_level), public.jlpt_level_rank(k.level))
             = public.jlpt_level_rank(p_level)) as seen,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       join public.kanji_word kw on kw.id = p.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where p.user_id = p_user_id
         and coalesce(public.kanji_word_unlock_rank(k.level, v.jlpt_level), public.jlpt_level_rank(k.level))
             = public.jlpt_level_rank(p_level)
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji_detail_words kdw
       join public.kanji k on k.id = kdw.kanji_id
       join public.kanji_word kw on kw.id = kdw.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where k.level = p_level and v.study_enabled
         and public.kanji_word_unlock_rank(k.level, v.jlpt_level) is null)
    +
    (select count(distinct w.kanji_word_id) from (
       select p.kanji_id, p.kanji_word_id from public.user_kanji_reading_progress p where p.user_id = p_user_id
       union
       select q.kanji_id, q.kanji_word_id from public.user_kanji_reading_pending q where q.user_id = p_user_id
     ) w
       join public.kanji k on k.id = w.kanji_id
       join public.kanji_word kw on kw.id = w.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where v.study_enabled
         and public.kanji_word_unlock_rank(k.level, v.jlpt_level) = public.jlpt_level_rank(p_level)
         and exists (
           select 1 from public.user_kanji_meaning_progress m
           where m.user_id = p_user_id and m.kanji_id = w.kanji_id
         )
         and exists (
           select 1 from public.user_study_settings s
           where s.user_id = p_user_id and k.level = any(s.enabled_levels)
         )) as total

  union all

  select 'vocabulary'::text,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level) as seen,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.vocabulary where jlpt_level = p_level and study_enabled) as total

  union all

  select 'hiragana_reading'::text,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_hiragana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'katakana_reading'::text,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_katakana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'hiragana_' || h.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.hiragana h
  left join public.user_hiragana_progress p
    on p.hiragana_id = h.id and p.user_id = p_user_id
  where h.entry_kind != 'rule' and h.study_enabled
  group by h.kana_type

  union all

  select 'katakana_' || k.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.katakana k
  left join public.user_katakana_progress p
    on p.katakana_id = k.id and p.user_id = p_user_id
  where k.entry_kind != 'rule' and k.study_enabled
  group by k.kana_type;
$function$;

notify pgrst, 'reload schema';

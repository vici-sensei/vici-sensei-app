-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Retires the JMdict manual-review workflow -- the admin page at /admin/jmdict-review, the
-- get_vocabulary_match_review_queue() RPC it called, and scripts/link-vocabulary-jmdict.mjs are
-- all deleted from the app in this same change, so nothing reads or writes vocabulary_id through
-- that path anymore.
--
-- Also converts jmdict_entries.vocabulary_id from a single bigint into a bigint[] renamed
-- vocabulary_ids, so one JMdict entry can list more than one corresponding vocabulary row.
-- No data is lost: every existing scalar value becomes a single-element array, NULL stays NULL.
--
-- The old FK to vocabulary(id) is dropped -- Postgres has no FK constraint form for individual
-- array elements. The invariant the UNIQUE(vocabulary_id) constraint used to guarantee (no
-- vocabulary row claimed by two different jmdict_entries rows) is kept anyway, enforced instead by
-- a trigger, since arrays can't carry a plain UNIQUE constraint either.

drop policy "Admins can update jmdict_entries vocabulary_id" on public.jmdict_entries;
drop function public.get_vocabulary_match_review_queue();

alter table public.jmdict_entries drop constraint jmdict_entries_vocabulary_id_fkey;
alter table public.jmdict_entries drop constraint jmdict_entries_vocabulary_id_unique;
drop index if exists public.idx_jmdict_entries_vocabulary_id;

alter table public.jmdict_entries
  alter column vocabulary_id type bigint[]
  using (case when vocabulary_id is null then null else array[vocabulary_id] end);

alter table public.jmdict_entries rename column vocabulary_id to vocabulary_ids;

create index idx_jmdict_entries_vocabulary_ids on public.jmdict_entries using gin (vocabulary_ids);

create or replace function public.check_jmdict_vocabulary_ids_unique()
returns trigger
language plpgsql
as $$
begin
  if new.vocabulary_ids is not null and exists (
    select 1 from public.jmdict_entries je
    where je.id <> new.id
      and je.vocabulary_ids && new.vocabulary_ids
  ) then
    raise exception 'vocabulary_ids % already claimed by another jmdict_entries row', new.vocabulary_ids;
  end if;
  return new;
end;
$$;

create trigger trg_jmdict_vocabulary_ids_unique
  before insert or update of vocabulary_ids on public.jmdict_entries
  for each row execute function public.check_jmdict_vocabulary_ids_unique();

comment on column public.jmdict_entries.vocabulary_ids is 'public.vocabulary.id values this JMdict entry corresponds to. No FK -- arrays can''t reference a scalar PK -- trg_jmdict_vocabulary_ids_unique instead guarantees no vocabulary id appears in more than one jmdict_entries row, mirroring the old UNIQUE(vocabulary_id) constraint.';

-- New home for kanji-related reference rules (starting with Rendaku, id 147-159 in public.hiragana
-- -- the rendaku_rule row plus its 12 rendaku_k/_s/_t/_h example words). Rendaku describes how a
-- compound word's second element voices (て + かみ -> てがみ), a kanji-compound phenomenon, not a
-- kana orthography rule -- it never belonged alongside the actual hiragana/katakana character
-- tables. Column names are generalized (rule_type/rule_group instead of hiragana's kana_type/
-- gojuon_row) since this table is meant to grow with more kanji-related rules beyond rendaku, so
-- kana_type_check's closed enum (see 20260822_kana_tables.sql) isn't carried over here.

create table public.kanji_rules (
  id bigint generated always as identity primary key,
  rule_type text not null,
  rule_group text not null,
  entry_kind text not null check (entry_kind = any (array['rule', 'example'])),
  character text not null,
  romaji text not null,
  sort_order integer not null unique,
  sound_origin text not null default 'native' check (sound_origin = any (array['native', 'loanword'])),
  frequency_tier text not null default 'core' check (frequency_tier = any (array['core', 'rare', 'very_rare', 'historical'])),
  notes text
);

alter table public.kanji_rules enable row level security;

create policy "Authenticated users can read kanji_rules"
  on public.kanji_rules for select
  to authenticated
  using (true);

insert into public.kanji_rules (rule_type, rule_group, entry_kind, character, romaji, sort_order, sound_origin, frequency_tier, notes)
select kana_type, gojuon_row, entry_kind, character, romaji, row_number() over (order by sort_order), sound_origin, frequency_tier, notes
from public.hiragana
where id between 153 and 165
order by sort_order;

delete from public.hiragana where id between 153 and 165;

with ranked as (
  select id, row_number() over (order by sort_order) as new_sort_order
  from public.hiragana
)
update public.hiragana t
set sort_order = ranked.new_sort_order + 100000
from ranked
where ranked.id = t.id;

update public.hiragana
set sort_order = sort_order - 100000;

cluster public.hiragana using hiragana_sort_order_key;

-- Moves the Browse section titles (the "Voiced Sounds (Dakuten)"-style headings) out of
-- BrowseKanaListPage.tsx and into their own small lookup table, keyed by kana_type -- per user
-- request, since these labels will be needed in other places beyond this one page. `label` is the
-- beginner-friendly heading; `technical_term` is the Japanese linguistic term shown smaller/muted
-- next to it. `sort_order` is the shared display order (mirrors the section_rank scheme already
-- used to keep public.hiragana/public.katakana physically ordered, see
-- 20260829_move_yoon_above_sokuon.sql and later) -- 'seion' is included for completeness even
-- though Browse doesn't currently show a title for the main grid.
--
-- One row per kana_type, shared by both hiragana and katakana (the concept -- and its label -- is
-- identical regardless of script).

create table public.kana_rule_labels (
  kana_type text primary key,
  label text not null,
  technical_term text not null,
  sort_order integer not null unique
);

alter table public.kana_rule_labels enable row level security;

create policy "Authenticated users can read kana_rule_labels"
  on public.kana_rule_labels for select
  to authenticated
  using (true);

insert into public.kana_rule_labels (kana_type, label, technical_term, sort_order) values
  ('seion', 'Basic Sounds', 'Seion', 1),
  ('dakuten', 'Ten-Ten', 'Dakuten', 2),
  ('handakuten', 'Maru', 'Handakuten', 3),
  ('yoon', 'Combined Sounds', 'Yōon', 4),
  ('sokuon', 'Double Consonants', 'Sokuon', 5),
  ('n_gemination', 'Double N Sound', 'ん Gemination', 6),
  ('choonpu', 'Long Vowels', 'Chōonpu', 7),
  ('extended', 'Foreign Sound Combos', 'Extended Katakana', 8);

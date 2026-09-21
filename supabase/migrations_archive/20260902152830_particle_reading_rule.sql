-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds the 'particle_reading' kana_type -- already allowed by hiragana_kana_type_check but
-- never populated (kana_type='particle_reading' existed once, hiragana-only, covering は/へ
-- only, and was removed in 20260829_drop_hiragana_particle_and_historical.sql; the CHECK
-- constraint value survived that drop, the data didn't). This reintroduces it with a wider
-- scope (は/を/へ together) and a different shape: one combined rule row instead of two.
--
-- は/を/へ are read differently as grammar particles (wa/o/e) than as ordinary characters
-- (ha/wo/he, which is what their existing entry_kind='character' rows already teach). This is
-- hiragana-only by design -- katakana has no particle role for these characters.
--
-- Follows the entry_kind='rule' + entry_kind='example' shape every other kana_type here uses
-- (see e.g. 20260904_kana_rule_cards.sql, 20260906_selective_examples_and_seion_only_drill.sql):
-- the rule row is shown once via get_new_hiragana_rule_candidates/user_hiragana_rule_progress
-- and never re-enters the SRS queue; the example rows are real study_enabled (default true)
-- hiragana_reading cards via get_new_hiragana_candidates/user_hiragana_progress. Unlike other
-- kana_types' example rows (bare 2-character combos like きゃ/っか/んな), these three use short
-- whole-word phrases (わたしは, not bare は) -- a bare は example would collide with the
-- existing character-row は card (same glyph, different expected romaji, no context to tell
-- them apart), so the phrase carries the grammatical context needed for the answer to make
-- sense both as a review card prompt and as a Browse-page example.
--
-- sort_order has no gapless requirement (unique only, per 20260822_kana_tables.sql) but is
-- computed from the live max rather than hardcoded, matching 20260829_kana_seion_intro_rule.sql.
--
-- NOTE: inserting this data alone is not enough for it to show up on /browse/hiragana --
-- BrowseKanaListPage.tsx's SOUND_RULE_KANA_TYPES set is a separate, hardcoded allow-list that
-- also needs 'particle_reading' added (done alongside this migration, not part of it).

insert into public.kana_rule_labels (kana_type, label, technical_term, sort_order)
values ('particle_reading', 'Particle Readings', 'Joshi Readings', 9);

insert into public.hiragana
  ("character", romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
select
  v."character", v.romaji, v.gojuon_row,
  (select coalesce(max(sort_order), 0) from public.hiragana) + v.sort_offset,
  'particle_reading', v.entry_kind, 'native', 'core', v.notes
from (
  values
    (
      'は・を・へ', 'particle-reading', 'particle_reading_rule', 1, 'rule',
      e'Three characters read differently when they''re doing grammar instead of spelling a word: '
      || e'**は** (normally "ha") becomes **"wa"** when it marks the topic of a sentence, **を** '
      || e'(normally "wo") is always read **"o"** -- it only ever appears as this particle in '
      || e'modern Japanese -- and **へ** (normally "he") becomes **"e"** when it marks direction.'
      || e'\n\nYou''ll see this everywhere: わたしは (watashi wa, "as for me"), ほんを (hon o, '
      || e'"the book"), がっこうへ (gakkou e, "to school").'
    ),
    ('わたしは', 'watashi wa', 'particle_reading_ha', 2, 'example', null),
    ('ほんを',   'hon o',      'particle_reading_wo', 3, 'example', null),
    ('がっこうへ', 'gakkou e', 'particle_reading_he', 4, 'example', null)
) as v("character", romaji, gojuon_row, sort_offset, entry_kind, notes);

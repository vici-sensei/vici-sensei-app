/** Section headers for Browse's main-grid gojuon-row grouping -- matches the `gojuon_row` values
 * on seion/dakuten/handakuten rows in the hiragana/katakana reference tables (see
 * 20260822_kana_tables.sql). Yōon moved out of the main grid and into the "Sound Rules &
 * Combinations" section in 20260903_kana_orthography_rules_expansion.sql (it's titled directly
 * from kana_type there, not gojuon_row), so it isn't listed here anymore. */
export const GOJUON_ROW_LABELS: Record<string, string> = {
  a: "A",
  ka: "KA",
  sa: "SA",
  ta: "TA",
  na: "NA",
  ha: "HA",
  ma: "MA",
  ya: "YA",
  ra: "RA",
  wa: "WA",
  n: "N",
  ga: "GA",
  za: "ZA",
  da: "DA",
  ba: "BA",
  pa: "PA",
};

/** Family-group labels for Browse's "Extended Katakana" section (loanword sound combinations
 * from the 1991 gairaigo notice, e.g. ファ/ヴァ/ティ) -- kept separate from
 * GOJUON_ROW_LABELS above since it's a distinct set added in
 * 20260903_kana_orthography_rules.sql, unlike the closed classical gojuon chart. */
export const EXTENDED_KATAKANA_ROW_LABELS: Record<string, string> = {
  va: "ヴァ",
  she: "シェ",
  je: "ジェ",
  che: "チェ",
  ti: "ティ / トゥ",
  di: "ディ / ドゥ",
  fa: "ファ",
  wi: "ウィ",
  tsa: "ツァ",
  dyu: "デュ",
  fyu: "フュ",
  ye: "イェ",
  kwa: "クァ",
  kwi: "クィ",
  tyu: "テュ",
  vyu: "ヴュ",
};

/** Group labels for Browse's "Historical & Rare" section, added in
 * 20260903_kana_orthography_rules_expansion.sql -- covers both the obsolete わ-row characters
 * (ゐ/ゑ, ヰ/ヱ) and the iteration marks (ゝ/ゞ, ヽ/ヾ), which repeat the preceding kana instead
 * of having a sound of their own. */
export const HISTORICAL_ROW_LABELS: Record<string, string> = {
  historical_wa: "Obsolete わ-row (wi / we)",
  historical_va: "ゔ (rare voiced う)",
  iteration_unvoiced: "Iteration Mark (unvoiced)",
  iteration_voiced: "Iteration Mark (voiced)",
};

/** Row order + character count per gojuon row for the *main grid only* -- seion/dakuten/
 * handakuten, identical for hiragana and katakana (same 71 characters, same grouping, just a
 * different script) -- see 20260822_kana_tables.sql. This subset really is closed and will never
 * gain or lose a row, so Browse's loading skeleton can mirror its exact shape instead of a
 * generic/arbitrary placeholder grid. Yōon used to be listed here too, but moved to the "Sound
 * Rules & Combinations" section (see GOJUON_ROW_LABELS above), so the skeleton no longer needs to
 * account for it. */
export const GOJUON_ROW_LAYOUT: readonly { row: string; count: number }[] = [
  { row: "a", count: 5 },
  { row: "ka", count: 5 },
  { row: "sa", count: 5 },
  { row: "ta", count: 5 },
  { row: "na", count: 5 },
  { row: "ha", count: 5 },
  { row: "ma", count: 5 },
  { row: "ya", count: 3 },
  { row: "ra", count: 5 },
  { row: "wa", count: 2 },
  { row: "n", count: 1 },
  { row: "ga", count: 5 },
  { row: "za", count: 5 },
  { row: "da", count: 5 },
  { row: "ba", count: 5 },
  { row: "pa", count: 5 },
];

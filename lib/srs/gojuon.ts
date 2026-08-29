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
 * 20260903_kana_orthography_rules.sql, unlike the closed classical gojuon chart. The rare/
 * very_rare combinations (ツァ, デュ, フュ, イェ, クァ/グァ, クィ family, テュ, ヴュ family) were
 * dropped per user request (20260829_drop_katakana_rare_extended_and_historical.sql), leaving
 * only the core-tier families below. Latin labels (not the katakana itself), matching
 * GOJUON_ROW_LABELS' convention -- per user request, for consistency across every group heading
 * on the page. */
export const EXTENDED_KATAKANA_ROW_LABELS: Record<string, string> = {
  va: "VA",
  she: "SHE",
  je: "JE",
  che: "CHE",
  ti: "TI / TU",
  di: "DI / DU",
  fa: "FA",
  wi: "WI",
};

/** Family-group labels for the "Sound Rules & Combinations" section's subsections (RuleSubsection
 * in BrowseKanaListPage.tsx) -- same idea as GOJUON_ROW_LABELS/EXTENDED_KATAKANA_ROW_LABELS above,
 * but keyed by the gojuon_row values these kana_types' entry_kind = 'example' rows already carry
 * (20260903_kana_orthography_rules(_expansion).sql; n_gemination_example's own label added here
 * since ん-gemination only has the one na-row group -- shown for visual consistency with every
 * other category, not because there's more than one to split it from). Katakana's chōonpu isn't
 * listed here -- it was retagged with the *main chart's* own row keys (a/ka/sa/ta/na/ha/ma/ya/ra/wa,
 * 20260906_choonpu_gojuon_row_tags.sql) since it extends exactly those rows, so RuleSubsection
 * resolves its labels from GOJUON_ROW_LABELS instead. */
export const SOUND_RULE_ROW_LABELS: Record<string, string> = {
  // yōon, one group per consonant family (きゃ/きゅ/きょ, しゃ/しゅ/しょ, ...)
  kya: "KYA",
  sha: "SHA",
  cha: "CHA",
  nya: "NYA",
  hya: "HYA",
  mya: "MYA",
  rya: "RYA",
  gya: "GYA",
  ja: "JA",
  bya: "BYA",
  pya: "PYA",
  // sokuon, one group per doubled consonant row + a loanword group (katakana only: ッグ/ッズ/...)
  sokuon_ka: "KA",
  sokuon_sa: "SA",
  sokuon_ta: "TA",
  sokuon_pa: "PA",
  sokuon_loanword: "LOANWORD",
  // n_gemination's single group
  n_gemination_example: "NA",
};

/** Row order + character count per gojuon row for the *main grid only* -- seion/dakuten/
 * handakuten, identical for hiragana and katakana (same 71 characters, same grouping, just a
 * different script) -- see 20260822_kana_tables.sql. This subset really is closed and will never
 * gain or lose a row, so Browse's loading skeleton can mirror its exact shape instead of a
 * generic/arbitrary placeholder grid. Yōon used to be listed here too, but moved to the "Sound
 * Rules & Combinations" section (see GOJUON_ROW_LABELS above), so the skeleton no longer needs to
 * account for it. */
/** Resolves a gojuon_row to its display label across every source that defines one -- checked in
 * this order: SOUND_RULE_ROW_LABELS (yōon/sokuon/n_gemination's subsection groups),
 * EXTENDED_KATAKANA_ROW_LABELS (extended katakana's family groups), GOJUON_ROW_LABELS (the main
 * chart's rows, which chōonpu's examples were retagged to reuse -- 20260906_choonpu_gojuon_row_tags.sql),
 * falling back to the raw key uppercased for anything not yet in any map. Shared by Browse's
 * RuleSubsection and the /study "new_rule" intro card (NewKanaRuleIntroCard.tsx) so a row's label
 * never drifts between the two places it's shown. */
export function resolveRuleExampleRowLabel(gojuonRow: string): string {
  return (
    SOUND_RULE_ROW_LABELS[gojuonRow] ??
    EXTENDED_KATAKANA_ROW_LABELS[gojuonRow] ??
    GOJUON_ROW_LABELS[gojuonRow] ??
    gojuonRow.toUpperCase()
  );
}

/** Groups any gojuon_row-tagged rows by that column, preserving first-seen order (the caller is
 * expected to hand these in already sorted, e.g. by sort_order) -- shared by Browse's
 * RuleSubsection/GojuonRowSection and the /study "new_rule" intro card's example grid. */
export function groupByGojuonRow<T extends { gojuon_row: string }>(rows: T[]): [string, T[]][] {
  const byRow = new Map<string, T[]>();
  for (const row of rows) {
    const list = byRow.get(row.gojuon_row);
    if (list) list.push(row);
    else byRow.set(row.gojuon_row, [row]);
  }
  return Array.from(byRow.entries());
}

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

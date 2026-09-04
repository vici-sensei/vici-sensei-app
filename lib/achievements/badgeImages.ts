/** Maps an achievement_key to the filename of its vector artwork, in public/images/badges/ --
 * no naming convention required, name the SVG files however you like and just point each key at
 * its file here. A badge left as "" (the default for everything below) just shows its fallback
 * icon (see the `icon` field in lib/achievements/registry.tsx) until a filename is set -- BadgeArt
 * in app/components/ui/AchievementCard.tsx never even attempts to load an image for one that's
 * still empty, so there's no doomed network request either.
 *
 * Grouped and commented to match Settings > Profile > Badges' own category/subcategory layout
 * (and public/images/badges/README.md's badge-name table) purely for readability while filling
 * this in -- the object itself is flat, order doesn't matter to the code.
 */
export const BADGE_IMAGES: Record<string, string> = {
  // ===== Hiragana =====
  // Overall
  hiragana_total_1: "", // First Hiragana
  hiragana_total_5: "", // 5 Hiragana
  hiragana_total_10: "", // 10 Hiragana
  hiragana_total_20: "", // 20 Hiragana
  hiragana_total_30: "", // 30 Hiragana
  hiragana_total_40: "", // 40 Hiragana
  hiragana_seion_all: "", // Basic Sounds Master (Hiragana)
  // Ten-Ten
  hiragana_dakuten_1: "", // First Ten-Ten (Hiragana)
  hiragana_dakuten_5: "", // 5 Ten-Ten (Hiragana)
  hiragana_dakuten_10: "", // 10 Ten-Ten (Hiragana)
  hiragana_dakuten_all: "", // All Ten-Ten (Hiragana)
  // Maru
  hiragana_handakuten_1: "", // First Maru (Hiragana)
  hiragana_handakuten_all: "", // All Maru (Hiragana)
  // Combined Sounds
  hiragana_yoon_1: "", // First Combined Sound (Hiragana)
  hiragana_yoon_all: "", // All Combined Sounds (Hiragana)
  // Double N Sound
  hiragana_n_gemination_all: "", // Double N Sound (Hiragana)
  hiragana_all: "", // All Hiragana

  // ===== Katakana =====
  // Overall
  katakana_total_1: "", // First Katakana
  katakana_total_5: "", // 5 Katakana
  katakana_total_10: "", // 10 Katakana
  katakana_total_20: "", // 20 Katakana
  katakana_total_30: "", // 30 Katakana
  katakana_total_40: "", // 40 Katakana
  katakana_seion_all: "", // Basic Sounds Master (Katakana)
  // Ten-Ten
  katakana_dakuten_1: "", // First Ten-Ten (Katakana)
  katakana_dakuten_5: "", // 5 Ten-Ten (Katakana)
  katakana_dakuten_10: "", // 10 Ten-Ten (Katakana)
  katakana_dakuten_all: "", // All Ten-Ten (Katakana)
  // Maru
  katakana_handakuten_1: "", // First Maru (Katakana)
  katakana_handakuten_all: "", // All Maru (Katakana)
  // Combined Sounds
  katakana_yoon_1: "", // First Combined Sound (Katakana)
  katakana_yoon_all: "", // All Combined Sounds (Katakana)
  // Double Consonants
  katakana_sokuon_1: "", // First Double Consonant
  katakana_sokuon_all: "", // All Double Consonants
  // Double N Sound
  katakana_n_gemination_all: "", // Double N Sound (Katakana)
  // Long Vowels
  katakana_choonpu_1: "", // First Long Vowel
  katakana_choonpu_all: "", // All Long Vowels
  // Foreign Sound Combos
  katakana_extended_1: "", // First Foreign Sound Combo
  katakana_extended_5: "", // 5 Foreign Sound Combos
  katakana_extended_all: "", // All Foreign Sound Combos
  katakana_all: "", // All Katakana

  // ===== Kana =====
  kana_all: "", // All Kana

  // ===== Reading Tests =====
  // Hiragana
  hiragana_test: "", // Hiragana Reading Test
  hiragana_test_100: "", // Hiragana Reading Test — Perfect Score
  // Katakana
  katakana_test: "", // Katakana Reading Test
  katakana_test_100: "", // Katakana Reading Test — Perfect Score

  // ===== Kanji =====
  // N5
  kanji_total_1: "", // First Kanji
  kanji_total_5: "", // 5 Kanji
  kanji_total_10: "", // 10 Kanji
  kanji_total_50: "", // 50 Kanji
  kanji_n5_all: "", // All N5 Kanji
  // N4
  kanji_n4_1: "", // First N4 Kanji
  kanji_total_100: "", // 100 Kanji
  kanji_n4_all: "", // All N4 Kanji
  // N3
  kanji_n3_1: "", // First N3 Kanji
  kanji_total_500: "", // 500 Kanji
  kanji_n3_all: "", // All N3 Kanji
  // N2
  kanji_n2_1: "", // First N2 Kanji
  kanji_n2_all: "", // All N2 Kanji
  // N1
  kanji_n1_1: "", // First N1 Kanji
  kanji_total_1000: "", // 1000 Kanji
  kanji_total_1500: "", // 1500 Kanji
  kanji_total_2000: "", // 2000 Kanji
  kanji_n1_all: "", // All N1 Kanji

  // ===== Vocabulary =====
  // N5
  word_total_1: "", // First Word
  word_total_5: "", // 5 Words
  word_total_10: "", // 10 Words
  word_total_50: "", // 50 Words
  word_total_100: "", // 100 Words
  word_total_500: "", // 500 Words
  word_n5_all: "", // All N5 Words
  // N4
  word_n4_1: "", // First N4 Word
  word_total_1000: "", // 1000 Words
  word_n4_all: "", // All N4 Words
  // N3
  word_n3_1: "", // First N3 Word
  word_total_1500: "", // 1500 Words
  word_total_2000: "", // 2000 Words
  word_n3_all: "", // All N3 Words
  // N2
  word_n2_1: "", // First N2 Word
  word_n2_all: "", // All N2 Words
  // N1
  word_n1_1: "", // First N1 Word
  word_n1_all: "", // All N1 Words

  // ===== JLPT Levels =====
  n5_completed: "", // N5 Completed
  n4_completed: "", // N4 Completed
  n3_completed: "", // N3 Completed
  n2_completed: "", // N2 Completed
  n1_completed: "", // N1 Completed
};

/** Resolves an achievement_key to its image URL under /images/badges/, or undefined if no
 * filename has been assigned to it yet in BADGE_IMAGES above. */
export function achievementImageSrc(achievementKey: string): string | undefined {
  const filename = BADGE_IMAGES[achievementKey];
  return filename ? `/images/badges/${filename}` : undefined;
}

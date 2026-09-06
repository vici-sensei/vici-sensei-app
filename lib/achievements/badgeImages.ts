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
  // TO DO - BADGE IMAGES
  // ===== Hiragana =====
  // Overall
  hiragana_total_1: "yukata_fireworks.webp", // First Hiragana
  hiragana_total_5: "asakusa.webp", // 5 Hiragana
  hiragana_total_10: "bonsai.webp", // 10 Hiragana
  hiragana_total_20: "buddha.webp", // 20 Hiragana
  hiragana_total_30: "chouchin.webp", // 30 Hiragana
  hiragana_total_40: "dango.webp", // 40 Hiragana
  hiragana_seion_all: "daruma.webp", // Basic Sounds Master (Hiragana)
  // Ten-Ten
  hiragana_dakuten_1: "dragon.webp", // First Ten-Ten (Hiragana)
  hiragana_dakuten_5: "ema.webp", // 5 Ten-Ten (Hiragana)
  hiragana_dakuten_10: "fujin.webp", // 10 Ten-Ten (Hiragana)
  hiragana_dakuten_all: "geisha.webp", // All Ten-Ten (Hiragana)
  // Maru
  hiragana_handakuten_1: "Inari.webp", // First Maru (Hiragana)
  hiragana_handakuten_all: "arashiyama.webp", // All Maru (Hiragana)
  // Combined Sounds
  hiragana_yoon_1: "karate.webp", // First Combined Sound (Hiragana)
  hiragana_yoon_all: "karesansui.webp", // All Combined Sounds (Hiragana)
  // Double N Sound
  hiragana_n_gemination_all: "katana.webp", // Double N Sound (Hiragana)
  hiragana_all: "kinkakuji.webp", // All Hiragana

  // ===== Katakana =====
  // Overall
  katakana_total_1: "kitsune.webp", // First Katakana
  katakana_total_5: "koi.webp", // 5 Katakana
  katakana_total_10: "koinobori.webp", // 10 Katakana
  katakana_total_20: "lanterns.webp", // 20 Katakana
  katakana_total_30: "lotus.webp", // 30 Katakana
  katakana_total_40: "maiko.webp", // 40 Katakana
  katakana_seion_all: "maneki.webp", // Basic Sounds Master (Katakana)
  // Ten-Ten
  katakana_dakuten_1: "mask.webp", // First Ten-Ten (Katakana)
  katakana_dakuten_5: "matcha.webp", // 5 Ten-Ten (Katakana)
  katakana_dakuten_10: "momiji.webp", // 10 Ten-Ten (Katakana)
  katakana_dakuten_all: "ninja.webp", // All Ten-Ten (Katakana)
  // Maru
  katakana_handakuten_1: "omikuji.webp", // First Maru (Katakana)
  katakana_handakuten_all: "oni.webp", // All Maru (Katakana)
  // Combined Sounds
  katakana_yoon_1: "onigiri.webp", // First Combined Sound (Katakana)
  katakana_yoon_all: "osaka.webp", // All Combined Sounds (Katakana)
  // Double Consonants
  katakana_sokuon_1: "pagoda.webp", // First Double Consonant
  katakana_sokuon_all: "ramen.webp", // All Double Consonants
  // Double N Sound
  katakana_n_gemination_all: "sake.webp", // Double N Sound (Katakana)
  // Long Vowels
  katakana_choonpu_1: "sakura.webp", // First Long Vowel
  katakana_choonpu_all: "samurai.webp", // All Long Vowels
  // Foreign Sound Combos
  katakana_extended_1: "sensu.webp", // First Foreign Sound Combo
  katakana_extended_5: "skytree.webp", // 5 Foreign Sound Combos
  katakana_extended_all: "sushi.webp", // All Foreign Sound Combos
  katakana_all: "tanabata.webp", // All Katakana

  // ===== Kana =====
  kana_all: "tanuki.webp", // All Kana

  // ===== Reading Tests =====
  // Hiragana
  hiragana_test: "tengu.webp", // Hiragana Reading Test
  hiragana_test_100: "tsuru.webp", // Hiragana Reading Test — Perfect Score
  // Katakana
  katakana_test: "wagashi.webp", // Katakana Reading Test
  katakana_test_100: "kappa.webp", // Katakana Reading Test — Perfect Score

  // ===== Kanji =====
  // N5
  kanji_total_1: "shamisen.webp", // First Kanji
  kanji_total_5: "koto.webp", // 5 Kanji
  kanji_total_10: "taiko.webp", // 10 Kanji
  kanji_total_50: "yumi.webp", // 50 Kanji
  kanji_n5_all: "nara.webp", // All N5 Kanji
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

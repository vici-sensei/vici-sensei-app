import type { IconType } from "react-icons";
import { FaBookOpen, FaCrown, FaStar, FaTrophy } from "react-icons/fa6";

export interface AchievementCatalogEntry {
  achievementKey: string;
  icon: IconType;
  title: string;
  /** Shown once earned. */
  description: string;
  /** Shown while still locked, in place of `description`. */
  lockedDescription: string;
}

export interface AchievementSubcategory {
  /** Omitted for a category with only one subcategory -- BadgesSection skips the sub-header in
   * that case rather than showing a redundant single nested heading under the category's own. */
  label?: string;
  entries: AchievementCatalogEntry[];
}

export interface AchievementCategory {
  key: string;
  label: string;
  subcategories: AchievementSubcategory[];
}

/** Every achievement that exists, earned or not, grouped for display -- lets BadgesSection render
 * one labeled section per category (locked entries greyed out within it) instead of one
 * undifferentiated 87-card list. "Learned"/"mastered" everywhere here means status in ('review',
 * 'relearning') on the matching progress table -- the same bar get_level_progress and
 * evaluate_kana_achievements (20260924_kana_achievements.sql) use, so a badge here can never
 * disagree with the dashboard's own progress rings. The Reading Tests category is awarded by
 * reading_test_progress_updates_status instead (20260925_test_status_feeds_achievements.sql), and
 * Kanji/Vocabulary/JLPT Levels by evaluate_kanji_vocab_achievements
 * (20260926_kanji_vocab_jlpt_achievements.sql).
 *
 * Kana thresholds match how many study_enabled, non-rule rows actually exist per (script,
 * kana_type): hiragana seion 46 / dakuten 20 / handakuten 5 / yoon 6 / n_gemination 1 (81 total);
 * katakana seion 45 / dakuten 20 / handakuten 5 / yoon 6 / sokuon 3 / n_gemination 1 / choonpu 3 /
 * extended 8 (91 total). Groups too small to distinguish "first" from "all" (handakuten, yoon,
 * n_gemination, choonpu) skip the in-between counts; hiragana has no sokuon entries since it
 * wasn't in the original wishlist and its 3-character group is easy to conflate with katakana's.
 */
export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  {
    key: "hiragana",
    label: "Hiragana",
    subcategories: [
      {
        label: "Overall",
        entries: [
          {
            achievementKey: "hiragana_total_1",
            icon: FaStar,
            title: "First Hiragana",
            description: "You mastered your first hiragana character.",
            lockedDescription: "Master your first hiragana character to earn this badge.",
          },
          {
            achievementKey: "hiragana_total_5",
            icon: FaStar,
            title: "5 Hiragana",
            description: "You mastered 5 hiragana characters.",
            lockedDescription: "Master 5 hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_total_10",
            icon: FaStar,
            title: "10 Hiragana",
            description: "You mastered 10 hiragana characters.",
            lockedDescription: "Master 10 hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_total_20",
            icon: FaStar,
            title: "20 Hiragana",
            description: "You mastered 20 hiragana characters.",
            lockedDescription: "Master 20 hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_total_30",
            icon: FaStar,
            title: "30 Hiragana",
            description: "You mastered 30 hiragana characters.",
            lockedDescription: "Master 30 hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_total_40",
            icon: FaStar,
            title: "40 Hiragana",
            description: "You mastered 40 hiragana characters.",
            lockedDescription: "Master 40 hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_seion_all",
            icon: FaCrown,
            title: "Basic Sounds Master (Hiragana)",
            description: "You mastered all 46 basic hiragana sounds (seion).",
            lockedDescription: "Master all 46 basic hiragana sounds (seion) to earn this badge.",
          },
        ],
      },
      {
        label: "Ten-Ten",
        entries: [
          {
            achievementKey: "hiragana_dakuten_1",
            icon: FaStar,
            title: "First Ten-Ten (Hiragana)",
            description: "You mastered your first ten-ten (dakuten) hiragana character.",
            lockedDescription: "Master your first ten-ten (dakuten) hiragana character to earn this badge.",
          },
          {
            achievementKey: "hiragana_dakuten_5",
            icon: FaStar,
            title: "5 Ten-Ten (Hiragana)",
            description: "You mastered 5 ten-ten hiragana characters.",
            lockedDescription: "Master 5 ten-ten hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_dakuten_10",
            icon: FaStar,
            title: "10 Ten-Ten (Hiragana)",
            description: "You mastered 10 ten-ten hiragana characters.",
            lockedDescription: "Master 10 ten-ten hiragana characters to earn this badge.",
          },
          {
            achievementKey: "hiragana_dakuten_all",
            icon: FaCrown,
            title: "All Ten-Ten (Hiragana)",
            description: "You mastered all 20 ten-ten hiragana characters.",
            lockedDescription: "Master all 20 ten-ten hiragana characters to earn this badge.",
          },
        ],
      },
      {
        label: "Maru",
        entries: [
          {
            achievementKey: "hiragana_handakuten_1",
            icon: FaStar,
            title: "First Maru (Hiragana)",
            description: "You mastered your first maru (handakuten) hiragana character.",
            lockedDescription: "Master your first maru (handakuten) hiragana character to earn this badge.",
          },
          {
            achievementKey: "hiragana_handakuten_all",
            icon: FaCrown,
            title: "All Maru (Hiragana)",
            description: "You mastered all 5 maru hiragana characters.",
            lockedDescription: "Master all 5 maru hiragana characters to earn this badge.",
          },
        ],
      },
      {
        label: "Combined Sounds",
        entries: [
          {
            achievementKey: "hiragana_yoon_1",
            icon: FaStar,
            title: "First Combined Sound (Hiragana)",
            description: "You mastered your first combined-sound hiragana character.",
            lockedDescription: "Master your first combined-sound hiragana character to earn this badge.",
          },
          {
            achievementKey: "hiragana_yoon_all",
            icon: FaCrown,
            title: "All Combined Sounds (Hiragana)",
            description: "You mastered all combined-sound hiragana characters.",
            lockedDescription: "Master every combined-sound hiragana character to earn this badge.",
          },
        ],
      },
      {
        label: "Double N Sound",
        entries: [
          {
            achievementKey: "hiragana_n_gemination_all",
            icon: FaCrown,
            title: "Double N Sound (Hiragana)",
            description: "You mastered the hiragana ん double-N sound.",
            lockedDescription: "Master the hiragana ん double-N sound to earn this badge.",
          },
        ],
      },
      {
        // Requires every kana_type done (seion, dakuten, handakuten, yoon, sokuon,
        // n_gemination), so this is always the last hiragana achievement earned -- kept as its
        // own final, unlabeled group (same convention as Kana/JLPT Levels below) instead of
        // bundled into "Overall", where it used to visually read as an early win.
        entries: [
          {
            achievementKey: "hiragana_all",
            icon: FaTrophy,
            title: "All Hiragana",
            description: "You mastered every hiragana character!",
            lockedDescription: "Master every hiragana character to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "katakana",
    label: "Katakana",
    subcategories: [
      {
        label: "Overall",
        entries: [
          {
            achievementKey: "katakana_total_1",
            icon: FaStar,
            title: "First Katakana",
            description: "You mastered your first katakana character.",
            lockedDescription: "Master your first katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_total_5",
            icon: FaStar,
            title: "5 Katakana",
            description: "You mastered 5 katakana characters.",
            lockedDescription: "Master 5 katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_total_10",
            icon: FaStar,
            title: "10 Katakana",
            description: "You mastered 10 katakana characters.",
            lockedDescription: "Master 10 katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_total_20",
            icon: FaStar,
            title: "20 Katakana",
            description: "You mastered 20 katakana characters.",
            lockedDescription: "Master 20 katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_total_30",
            icon: FaStar,
            title: "30 Katakana",
            description: "You mastered 30 katakana characters.",
            lockedDescription: "Master 30 katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_total_40",
            icon: FaStar,
            title: "40 Katakana",
            description: "You mastered 40 katakana characters.",
            lockedDescription: "Master 40 katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_seion_all",
            icon: FaCrown,
            title: "Basic Sounds Master (Katakana)",
            description: "You mastered all 45 basic katakana sounds (seion).",
            lockedDescription: "Master all 45 basic katakana sounds (seion) to earn this badge.",
          },
        ],
      },
      {
        label: "Ten-Ten",
        entries: [
          {
            achievementKey: "katakana_dakuten_1",
            icon: FaStar,
            title: "First Ten-Ten (Katakana)",
            description: "You mastered your first ten-ten (dakuten) katakana character.",
            lockedDescription: "Master your first ten-ten (dakuten) katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_dakuten_5",
            icon: FaStar,
            title: "5 Ten-Ten (Katakana)",
            description: "You mastered 5 ten-ten katakana characters.",
            lockedDescription: "Master 5 ten-ten katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_dakuten_10",
            icon: FaStar,
            title: "10 Ten-Ten (Katakana)",
            description: "You mastered 10 ten-ten katakana characters.",
            lockedDescription: "Master 10 ten-ten katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_dakuten_all",
            icon: FaCrown,
            title: "All Ten-Ten (Katakana)",
            description: "You mastered all 20 ten-ten katakana characters.",
            lockedDescription: "Master all 20 ten-ten katakana characters to earn this badge.",
          },
        ],
      },
      {
        label: "Maru",
        entries: [
          {
            achievementKey: "katakana_handakuten_1",
            icon: FaStar,
            title: "First Maru (Katakana)",
            description: "You mastered your first maru (handakuten) katakana character.",
            lockedDescription: "Master your first maru (handakuten) katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_handakuten_all",
            icon: FaCrown,
            title: "All Maru (Katakana)",
            description: "You mastered all 5 maru katakana characters.",
            lockedDescription: "Master all 5 maru katakana characters to earn this badge.",
          },
        ],
      },
      {
        label: "Combined Sounds",
        entries: [
          {
            achievementKey: "katakana_yoon_1",
            icon: FaStar,
            title: "First Combined Sound (Katakana)",
            description: "You mastered your first combined-sound katakana character.",
            lockedDescription: "Master your first combined-sound katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_yoon_all",
            icon: FaCrown,
            title: "All Combined Sounds (Katakana)",
            description: "You mastered all combined-sound katakana characters.",
            lockedDescription: "Master every combined-sound katakana character to earn this badge.",
          },
        ],
      },
      {
        label: "Double Consonants",
        entries: [
          {
            achievementKey: "katakana_sokuon_1",
            icon: FaStar,
            title: "First Double Consonant",
            description: "You mastered your first double-consonant (sokuon) katakana character.",
            lockedDescription: "Master your first double-consonant (sokuon) katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_sokuon_all",
            icon: FaCrown,
            title: "All Double Consonants",
            description: "You mastered all double-consonant katakana characters.",
            lockedDescription: "Master every double-consonant katakana character to earn this badge.",
          },
        ],
      },
      {
        label: "Double N Sound",
        entries: [
          {
            achievementKey: "katakana_n_gemination_all",
            icon: FaCrown,
            title: "Double N Sound (Katakana)",
            description: "You mastered the katakana ン double-N sound.",
            lockedDescription: "Master the katakana ン double-N sound to earn this badge.",
          },
        ],
      },
      {
        label: "Long Vowels",
        entries: [
          {
            achievementKey: "katakana_choonpu_1",
            icon: FaStar,
            title: "First Long Vowel",
            description: "You mastered your first long-vowel (choonpu) katakana character.",
            lockedDescription: "Master your first long-vowel (choonpu) katakana character to earn this badge.",
          },
          {
            achievementKey: "katakana_choonpu_all",
            icon: FaCrown,
            title: "All Long Vowels",
            description: "You mastered every long-vowel katakana character.",
            lockedDescription: "Master every long-vowel katakana character to earn this badge.",
          },
        ],
      },
      {
        label: "Foreign Sound Combos",
        entries: [
          {
            achievementKey: "katakana_extended_1",
            icon: FaStar,
            title: "First Foreign Sound Combo",
            description: "You mastered your first foreign sound combo (e.g. ファ, ヴィ).",
            lockedDescription: "Master your first foreign sound combo (e.g. ファ, ヴィ) to earn this badge.",
          },
          {
            achievementKey: "katakana_extended_5",
            icon: FaStar,
            title: "5 Foreign Sound Combos",
            description: "You mastered 5 foreign sound combo katakana characters.",
            lockedDescription: "Master 5 foreign sound combo katakana characters to earn this badge.",
          },
          {
            achievementKey: "katakana_extended_all",
            icon: FaCrown,
            title: "All Foreign Sound Combos",
            description: "You mastered every foreign sound combo katakana character.",
            lockedDescription: "Master every foreign sound combo katakana character to earn this badge.",
          },
        ],
      },
      {
        // Requires every kana_type done, same reasoning as hiragana_all above -- always the last
        // katakana achievement earned.
        entries: [
          {
            achievementKey: "katakana_all",
            icon: FaTrophy,
            title: "All Katakana",
            description: "You mastered every katakana character!",
            lockedDescription: "Master every katakana character to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "kana",
    label: "Kana",
    subcategories: [
      {
        entries: [
          {
            achievementKey: "kana_all",
            icon: FaTrophy,
            title: "All Kana",
            description: "You mastered every hiragana and katakana character!",
            lockedDescription: "Master every hiragana and katakana character to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "reading_tests",
    label: "Reading Tests",
    // Awarded by reading_test_progress_updates_status (20260925_test_status_feeds_achievements.sql)
    // whenever every sentence in a reading test has an answer -- '_test' fires on that first full
    // pass regardless of score, '_test_100' the first time that pass is a perfect one. Both are
    // permanent once earned (award_achievement is insert-only), so a later lower-scoring retry
    // can't take '_test_100' away.
    subcategories: [
      {
        label: "Hiragana",
        entries: [
          {
            achievementKey: "hiragana_test",
            icon: FaBookOpen,
            title: "Hiragana Reading Test",
            description: "You completed the Hiragana reading test.",
            lockedDescription: "Complete the Hiragana reading test to earn this badge.",
          },
          {
            achievementKey: "hiragana_test_100",
            icon: FaCrown,
            title: "Hiragana Reading Test — Perfect Score",
            description: "You scored 100% on the Hiragana reading test.",
            lockedDescription: "Score 100% on the Hiragana reading test to earn this badge.",
          },
        ],
      },
      {
        label: "Katakana",
        entries: [
          {
            achievementKey: "katakana_test",
            icon: FaBookOpen,
            title: "Katakana Reading Test",
            description: "You completed the Katakana reading test.",
            lockedDescription: "Complete the Katakana reading test to earn this badge.",
          },
          {
            achievementKey: "katakana_test_100",
            icon: FaCrown,
            title: "Katakana Reading Test — Perfect Score",
            description: "You scored 100% on the Katakana reading test.",
            lockedDescription: "Score 100% on the Katakana reading test to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "kanji",
    label: "Kanji",
    // "Fully learned" = the kanji_meaning card mastered AND every one of its kanji_reading
    // example-word cards mastered too (see kanji_vocab_progress_updates_achievements,
    // 20260926_kanji_vocab_jlpt_achievements.sql). Grouped by JLPT level, in the exact order a
    // student actually crosses each threshold -- computed from the real per-level kanji counts
    // (N5 79, N4 167, N3 367, N2 373, N1 1243; cumulative 79 / 246 / 613 / 986 / 2229), since the
    // cumulative "kanji_total_N" milestones don't line up with level boundaries: kanji_total_100
    // is only reached partway through N4 (79 done at N5 + 21 into N4), kanji_total_1000 only
    // partway through N1 (986 done through N2 + 14 into N1), and so on. A "first N_ kanji" always
    // lands immediately after the previous level's "all" -- finishing a level's last kanji is
    // exactly what makes the next level's first one available.
    subcategories: [
      {
        label: "N5",
        entries: [
          {
            achievementKey: "kanji_total_1",
            icon: FaStar,
            title: "First Kanji",
            description: "You mastered your first kanji — its meaning and every reading example word.",
            lockedDescription: "Master your first kanji (its meaning and every reading example word) to earn this badge.",
          },
          {
            achievementKey: "kanji_total_5",
            icon: FaStar,
            title: "5 Kanji",
            description: "You mastered 5 kanji.",
            lockedDescription: "Master 5 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_10",
            icon: FaStar,
            title: "10 Kanji",
            description: "You mastered 10 kanji.",
            lockedDescription: "Master 10 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_50",
            icon: FaStar,
            title: "50 Kanji",
            description: "You mastered 50 kanji.",
            lockedDescription: "Master 50 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_n5_all",
            icon: FaCrown,
            title: "All N5 Kanji",
            description: "You mastered every N5 kanji.",
            lockedDescription: "Master every N5 kanji to earn this badge.",
          },
        ],
      },
      {
        label: "N4",
        entries: [
          {
            achievementKey: "kanji_n4_1",
            icon: FaStar,
            title: "First N4 Kanji",
            description: "You mastered your first N4 kanji.",
            lockedDescription: "Master your first N4 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_100",
            icon: FaStar,
            title: "100 Kanji",
            description: "You mastered 100 kanji.",
            lockedDescription: "Master 100 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_n4_all",
            icon: FaCrown,
            title: "All N4 Kanji",
            description: "You mastered every N4 kanji.",
            lockedDescription: "Master every N4 kanji to earn this badge.",
          },
        ],
      },
      {
        label: "N3",
        entries: [
          {
            achievementKey: "kanji_n3_1",
            icon: FaStar,
            title: "First N3 Kanji",
            description: "You mastered your first N3 kanji.",
            lockedDescription: "Master your first N3 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_500",
            icon: FaStar,
            title: "500 Kanji",
            description: "You mastered 500 kanji.",
            lockedDescription: "Master 500 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_n3_all",
            icon: FaCrown,
            title: "All N3 Kanji",
            description: "You mastered every N3 kanji.",
            lockedDescription: "Master every N3 kanji to earn this badge.",
          },
        ],
      },
      {
        label: "N2",
        entries: [
          {
            achievementKey: "kanji_n2_1",
            icon: FaStar,
            title: "First N2 Kanji",
            description: "You mastered your first N2 kanji.",
            lockedDescription: "Master your first N2 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_n2_all",
            icon: FaCrown,
            title: "All N2 Kanji",
            description: "You mastered every N2 kanji.",
            lockedDescription: "Master every N2 kanji to earn this badge.",
          },
        ],
      },
      {
        label: "N1",
        entries: [
          {
            achievementKey: "kanji_n1_1",
            icon: FaStar,
            title: "First N1 Kanji",
            description: "You mastered your first N1 kanji.",
            lockedDescription: "Master your first N1 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_1000",
            icon: FaStar,
            title: "1000 Kanji",
            description: "You mastered 1000 kanji.",
            lockedDescription: "Master 1000 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_1500",
            icon: FaStar,
            title: "1500 Kanji",
            description: "You mastered 1500 kanji.",
            lockedDescription: "Master 1500 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_total_2000",
            icon: FaStar,
            title: "2000 Kanji",
            description: "You mastered 2000 kanji.",
            lockedDescription: "Master 2000 kanji to earn this badge.",
          },
          {
            achievementKey: "kanji_n1_all",
            icon: FaCrown,
            title: "All N1 Kanji",
            description: "You mastered every N1 kanji.",
            lockedDescription: "Master every N1 kanji to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "vocabulary",
    label: "Vocabulary",
    // "Fully learned" = the vocab_meaning card mastered -- vocabulary has no separate reading
    // card of its own, so there's nothing else to combine it with. Grouped by JLPT level, same
    // reasoning as Kanji above -- computed from the real per-level word counts (N5 655, N4 567,
    // N3 1637, N2 1580, N1 2700; cumulative 655 / 1222 / 2859 / 4439 / 7139), so e.g.
    // word_total_1000 lands partway through N4 (655 done at N5 + 345 into N4) and
    // word_total_1500/2000 both land partway through N3.
    subcategories: [
      {
        label: "N5",
        entries: [
          {
            achievementKey: "word_total_1",
            icon: FaStar,
            title: "First Word",
            description: "You mastered your first vocabulary word.",
            lockedDescription: "Master your first vocabulary word to earn this badge.",
          },
          {
            achievementKey: "word_total_5",
            icon: FaStar,
            title: "5 Words",
            description: "You mastered 5 vocabulary words.",
            lockedDescription: "Master 5 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_total_10",
            icon: FaStar,
            title: "10 Words",
            description: "You mastered 10 vocabulary words.",
            lockedDescription: "Master 10 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_total_50",
            icon: FaStar,
            title: "50 Words",
            description: "You mastered 50 vocabulary words.",
            lockedDescription: "Master 50 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_total_100",
            icon: FaStar,
            title: "100 Words",
            description: "You mastered 100 vocabulary words.",
            lockedDescription: "Master 100 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_total_500",
            icon: FaStar,
            title: "500 Words",
            description: "You mastered 500 vocabulary words.",
            lockedDescription: "Master 500 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_n5_all",
            icon: FaCrown,
            title: "All N5 Words",
            description: "You mastered every N5 word.",
            lockedDescription: "Master every N5 word to earn this badge.",
          },
        ],
      },
      {
        label: "N4",
        entries: [
          {
            achievementKey: "word_n4_1",
            icon: FaStar,
            title: "First N4 Word",
            description: "You mastered your first N4 word.",
            lockedDescription: "Master your first N4 word to earn this badge.",
          },
          {
            achievementKey: "word_total_1000",
            icon: FaStar,
            title: "1000 Words",
            description: "You mastered 1000 vocabulary words.",
            lockedDescription: "Master 1000 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_n4_all",
            icon: FaCrown,
            title: "All N4 Words",
            description: "You mastered every N4 word.",
            lockedDescription: "Master every N4 word to earn this badge.",
          },
        ],
      },
      {
        label: "N3",
        entries: [
          {
            achievementKey: "word_n3_1",
            icon: FaStar,
            title: "First N3 Word",
            description: "You mastered your first N3 word.",
            lockedDescription: "Master your first N3 word to earn this badge.",
          },
          {
            achievementKey: "word_total_1500",
            icon: FaStar,
            title: "1500 Words",
            description: "You mastered 1500 vocabulary words.",
            lockedDescription: "Master 1500 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_total_2000",
            icon: FaStar,
            title: "2000 Words",
            description: "You mastered 2000 vocabulary words.",
            lockedDescription: "Master 2000 vocabulary words to earn this badge.",
          },
          {
            achievementKey: "word_n3_all",
            icon: FaCrown,
            title: "All N3 Words",
            description: "You mastered every N3 word.",
            lockedDescription: "Master every N3 word to earn this badge.",
          },
        ],
      },
      {
        label: "N2",
        entries: [
          {
            achievementKey: "word_n2_1",
            icon: FaStar,
            title: "First N2 Word",
            description: "You mastered your first N2 word.",
            lockedDescription: "Master your first N2 word to earn this badge.",
          },
          {
            achievementKey: "word_n2_all",
            icon: FaCrown,
            title: "All N2 Words",
            description: "You mastered every N2 word.",
            lockedDescription: "Master every N2 word to earn this badge.",
          },
        ],
      },
      {
        label: "N1",
        entries: [
          {
            achievementKey: "word_n1_1",
            icon: FaStar,
            title: "First N1 Word",
            description: "You mastered your first N1 word.",
            lockedDescription: "Master your first N1 word to earn this badge.",
          },
          {
            achievementKey: "word_n1_all",
            icon: FaCrown,
            title: "All N1 Words",
            description: "You mastered every N1 word.",
            lockedDescription: "Master every N1 word to earn this badge.",
          },
        ],
      },
    ],
  },

  {
    key: "jlpt",
    label: "JLPT Levels",
    // Mirrors check_and_advance_jlpt_level's own bar exactly (kanji, kanji_reading, and vocabulary
    // categories all fully learned at that level) -- fires at the same moment the level-up modal
    // does.
    subcategories: [
      {
        entries: [
          {
            achievementKey: "n5_completed",
            icon: FaTrophy,
            title: "N5 Completed",
            description: "You completed N5 -- every kanji, kanji reading, and vocabulary card mastered!",
            lockedDescription: "Master every N5 kanji, kanji reading, and vocabulary card to earn this badge.",
          },
          {
            achievementKey: "n4_completed",
            icon: FaTrophy,
            title: "N4 Completed",
            description: "You completed N4 -- every kanji, kanji reading, and vocabulary card mastered!",
            lockedDescription: "Master every N4 kanji, kanji reading, and vocabulary card to earn this badge.",
          },
          {
            achievementKey: "n3_completed",
            icon: FaTrophy,
            title: "N3 Completed",
            description: "You completed N3 -- every kanji, kanji reading, and vocabulary card mastered!",
            lockedDescription: "Master every N3 kanji, kanji reading, and vocabulary card to earn this badge.",
          },
          {
            achievementKey: "n2_completed",
            icon: FaTrophy,
            title: "N2 Completed",
            description: "You completed N2 -- every kanji, kanji reading, and vocabulary card mastered!",
            lockedDescription: "Master every N2 kanji, kanji reading, and vocabulary card to earn this badge.",
          },
          {
            achievementKey: "n1_completed",
            icon: FaTrophy,
            title: "N1 Completed",
            description: "You completed N1 -- every kanji, kanji reading, and vocabulary card mastered. The highest JLPT level!",
            lockedDescription: "Master every N1 kanji, kanji reading, and vocabulary card -- the highest JLPT level -- to earn this badge.",
          },
        ],
      },
    ],
  },
];

/** Flat view of every entry across every category and subcategory, in display order -- for
 * callers that don't care about grouping (e.g. looking up one achievement's catalog entry by
 * key). */
export const ACHIEVEMENT_CATALOG: AchievementCatalogEntry[] = ACHIEVEMENT_CATEGORIES.flatMap((category) =>
  category.subcategories.flatMap((subcategory) => subcategory.entries)
);

# Badge artwork

Drop one **SVG** per achievement here, named exactly as the "Image File" column below -- e.g.
`hiragana_all.svg`. `app/components/ui/AchievementCard.tsx`'s `BadgeArt` component requests
`/images/badges/<achievement_key>.svg` for every badge shown in Settings > Profile > Badges (both
earned and locked); if the file 404s it falls back to that badge's react-icons icon (`entry.icon`
in `lib/achievements/registry.tsx`), so nothing breaks while art is missing -- add files here
whenever they're ready, in any order, and they take over automatically with no code changes.

Rendered at 44×44 CSS px inside a `rounded-full` circle with `object-cover`. A square `viewBox`
(e.g. `0 0 64 64`) with the design filling the frame edge-to-edge works best -- the circular mask
crops to an inscribed circle, so keep anything important centered rather than in the corners.
Self-contained paths/shapes only (no external `<image>` refs or web fonts), since the file has to
render correctly wherever it's dropped. Locked badges render the same file through a `grayscale` +
`opacity-40` CSS filter, so no separate "locked" variant is needed.

The table below is a snapshot of every achievement in `lib/achievements/registry.tsx` as of this
writing (87 total), grouped exactly as they appear in Settings > Profile > Badges. It's not read
by any code, just a checklist -- if achievements are added/removed/renamed there later, regenerate
this table from that file instead of trusting it blindly.

### Hiragana

**Overall**

| Badge Name | Image File |
| --- | --- |
| First Hiragana | `hiragana_total_1.svg` |
| 5 Hiragana | `hiragana_total_5.svg` |
| 10 Hiragana | `hiragana_total_10.svg` |
| 20 Hiragana | `hiragana_total_20.svg` |
| 30 Hiragana | `hiragana_total_30.svg` |
| 40 Hiragana | `hiragana_total_40.svg` |
| Basic Sounds Master (Hiragana) | `hiragana_seion_all.svg` |

**Ten-Ten**

| Badge Name | Image File |
| --- | --- |
| First Ten-Ten (Hiragana) | `hiragana_dakuten_1.svg` |
| 5 Ten-Ten (Hiragana) | `hiragana_dakuten_5.svg` |
| 10 Ten-Ten (Hiragana) | `hiragana_dakuten_10.svg` |
| All Ten-Ten (Hiragana) | `hiragana_dakuten_all.svg` |

**Maru**

| Badge Name | Image File |
| --- | --- |
| First Maru (Hiragana) | `hiragana_handakuten_1.svg` |
| All Maru (Hiragana) | `hiragana_handakuten_all.svg` |

**Combined Sounds**

| Badge Name | Image File |
| --- | --- |
| First Combined Sound (Hiragana) | `hiragana_yoon_1.svg` |
| All Combined Sounds (Hiragana) | `hiragana_yoon_all.svg` |

**Double N Sound**

| Badge Name | Image File |
| --- | --- |
| Double N Sound (Hiragana) | `hiragana_n_gemination_all.svg` |
| All Hiragana | `hiragana_all.svg` |

### Katakana

**Overall**

| Badge Name | Image File |
| --- | --- |
| First Katakana | `katakana_total_1.svg` |
| 5 Katakana | `katakana_total_5.svg` |
| 10 Katakana | `katakana_total_10.svg` |
| 20 Katakana | `katakana_total_20.svg` |
| 30 Katakana | `katakana_total_30.svg` |
| 40 Katakana | `katakana_total_40.svg` |
| Basic Sounds Master (Katakana) | `katakana_seion_all.svg` |

**Ten-Ten**

| Badge Name | Image File |
| --- | --- |
| First Ten-Ten (Katakana) | `katakana_dakuten_1.svg` |
| 5 Ten-Ten (Katakana) | `katakana_dakuten_5.svg` |
| 10 Ten-Ten (Katakana) | `katakana_dakuten_10.svg` |
| All Ten-Ten (Katakana) | `katakana_dakuten_all.svg` |

**Maru**

| Badge Name | Image File |
| --- | --- |
| First Maru (Katakana) | `katakana_handakuten_1.svg` |
| All Maru (Katakana) | `katakana_handakuten_all.svg` |

**Combined Sounds**

| Badge Name | Image File |
| --- | --- |
| First Combined Sound (Katakana) | `katakana_yoon_1.svg` |
| All Combined Sounds (Katakana) | `katakana_yoon_all.svg` |

**Double Consonants**

| Badge Name | Image File |
| --- | --- |
| First Double Consonant | `katakana_sokuon_1.svg` |
| All Double Consonants | `katakana_sokuon_all.svg` |

**Double N Sound**

| Badge Name | Image File |
| --- | --- |
| Double N Sound (Katakana) | `katakana_n_gemination_all.svg` |

**Long Vowels**

| Badge Name | Image File |
| --- | --- |
| First Long Vowel | `katakana_choonpu_1.svg` |
| All Long Vowels | `katakana_choonpu_all.svg` |

**Foreign Sound Combos**

| Badge Name | Image File |
| --- | --- |
| First Foreign Sound Combo | `katakana_extended_1.svg` |
| 5 Foreign Sound Combos | `katakana_extended_5.svg` |
| All Foreign Sound Combos | `katakana_extended_all.svg` |
| All Katakana | `katakana_all.svg` |

### Kana

| Badge Name | Image File |
| --- | --- |
| All Kana | `kana_all.svg` |

### Reading Tests

**Hiragana**

| Badge Name | Image File |
| --- | --- |
| Hiragana Reading Test | `hiragana_test.svg` |
| Hiragana Reading Test — Perfect Score | `hiragana_test_100.svg` |

**Katakana**

| Badge Name | Image File |
| --- | --- |
| Katakana Reading Test | `katakana_test.svg` |
| Katakana Reading Test — Perfect Score | `katakana_test_100.svg` |

### Kanji

**N5**

| Badge Name | Image File |
| --- | --- |
| First Kanji | `kanji_total_1.svg` |
| 5 Kanji | `kanji_total_5.svg` |
| 10 Kanji | `kanji_total_10.svg` |
| 50 Kanji | `kanji_total_50.svg` |
| All N5 Kanji | `kanji_n5_all.svg` |

**N4**

| Badge Name | Image File |
| --- | --- |
| First N4 Kanji | `kanji_n4_1.svg` |
| 100 Kanji | `kanji_total_100.svg` |
| All N4 Kanji | `kanji_n4_all.svg` |

**N3**

| Badge Name | Image File |
| --- | --- |
| First N3 Kanji | `kanji_n3_1.svg` |
| 500 Kanji | `kanji_total_500.svg` |
| All N3 Kanji | `kanji_n3_all.svg` |

**N2**

| Badge Name | Image File |
| --- | --- |
| First N2 Kanji | `kanji_n2_1.svg` |
| All N2 Kanji | `kanji_n2_all.svg` |

**N1**

| Badge Name | Image File |
| --- | --- |
| First N1 Kanji | `kanji_n1_1.svg` |
| 1000 Kanji | `kanji_total_1000.svg` |
| 1500 Kanji | `kanji_total_1500.svg` |
| 2000 Kanji | `kanji_total_2000.svg` |
| All N1 Kanji | `kanji_n1_all.svg` |

### Vocabulary

**N5**

| Badge Name | Image File |
| --- | --- |
| First Word | `word_total_1.svg` |
| 5 Words | `word_total_5.svg` |
| 10 Words | `word_total_10.svg` |
| 50 Words | `word_total_50.svg` |
| 100 Words | `word_total_100.svg` |
| 500 Words | `word_total_500.svg` |
| All N5 Words | `word_n5_all.svg` |

**N4**

| Badge Name | Image File |
| --- | --- |
| First N4 Word | `word_n4_1.svg` |
| 1000 Words | `word_total_1000.svg` |
| All N4 Words | `word_n4_all.svg` |

**N3**

| Badge Name | Image File |
| --- | --- |
| First N3 Word | `word_n3_1.svg` |
| 1500 Words | `word_total_1500.svg` |
| 2000 Words | `word_total_2000.svg` |
| All N3 Words | `word_n3_all.svg` |

**N2**

| Badge Name | Image File |
| --- | --- |
| First N2 Word | `word_n2_1.svg` |
| All N2 Words | `word_n2_all.svg` |

**N1**

| Badge Name | Image File |
| --- | --- |
| First N1 Word | `word_n1_1.svg` |
| All N1 Words | `word_n1_all.svg` |

### JLPT Levels

| Badge Name | Image File |
| --- | --- |
| N5 Completed | `n5_completed.svg` |
| N4 Completed | `n4_completed.svg` |
| N3 Completed | `n3_completed.svg` |
| N2 Completed | `n2_completed.svg` |
| N1 Completed | `n1_completed.svg` |

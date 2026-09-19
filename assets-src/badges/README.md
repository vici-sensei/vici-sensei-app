# Badge artwork

This folder holds the **full-size masters** (WebP/PNG/JPG). They are *not* served to users -- they
live here, outside `public/`, so the deployed site doesn't ship 30+ MB of oversized images. The app
serves the small square copies that `npm run badges:optimize` generates from them.

## Adding or changing a badge

1. Drop the master in this folder, named however you like (no naming convention is required).
2. Point the achievement at that filename in `lib/achievements/badgeImages.ts`'s `BADGE_IMAGES`
   map (find its key in the table below, set its value to the filename).
3. Run `npm run badges:optimize`, then commit the new/changed files it produced under
   `public/images/badges/` plus `lib/achievements/badgeImageHashes.json`. It only regenerates what
   changed, and deletes outputs of masters that were changed or removed.

A badge whose filename is unset (`""`), or whose master hasn't been through step 3 yet, just shows
its react-icons icon (`entry.icon` in `lib/achievements/registry.tsx`) and never attempts a network
request for an image. If a generated file fails to load, it falls back to the icon too rather than
breaking the card.

## What the script produces

Two center-cropped squares per master -- the app shows them in a `rounded-full` circle with
`object-cover`, so anything outside the central square is never visible anyway:

| Folder | Size | Used for |
| --- | --- | --- |
| `public/images/badges/thumb/` | 192x192 (~10 KB) | the 64px circle in the list/grid views |
| `public/images/badges/full/` | 768x768 (~95 KB) | the enlarged circle in the click-to-open modal (shown at up to 512px) |

Neither is ever upscaled past the master's shorter side. Filenames are `<name>.<hash>.webp`, the
hash derived from the master and the resize settings, which is what allows `public/_headers` to
serve them as `immutable` -- a changed master gets a new URL, so nobody sees a stale copy.

Tips for masters: keep the important part of the artwork **centered** (only the middle square is
kept, and the circle crops the corners of that too), and make it at least 768px on the shorter
side -- a square 1024x1024 master is ideal. Locked badges render the same file through a
`grayscale` + `opacity-40` CSS filter, so no separate "locked" variant is needed.

The table below is a snapshot of every achievement in `lib/achievements/registry.tsx` as of this
writing (87 total), grouped exactly as they appear in Settings > Profile > Badges. It's not read
by any code, just a lookup to find the right key for `BADGE_IMAGES` -- if achievements are
added/removed/renamed there later, regenerate this table (and the map's keys) from that file
instead of trusting either blindly.

### Hiragana

**Overall**

| Badge Name | Achievement Key |
| --- | --- |
| First Hiragana | `hiragana_total_1` |
| 5 Hiragana | `hiragana_total_5` |
| 10 Hiragana | `hiragana_total_10` |
| 20 Hiragana | `hiragana_total_20` |
| 30 Hiragana | `hiragana_total_30` |
| 40 Hiragana | `hiragana_total_40` |
| Basic Sounds Master (Hiragana) | `hiragana_seion_all` |

**Ten-Ten**

| Badge Name | Achievement Key |
| --- | --- |
| First Ten-Ten (Hiragana) | `hiragana_dakuten_1` |
| 5 Ten-Ten (Hiragana) | `hiragana_dakuten_5` |
| 10 Ten-Ten (Hiragana) | `hiragana_dakuten_10` |
| All Ten-Ten (Hiragana) | `hiragana_dakuten_all` |

**Maru**

| Badge Name | Achievement Key |
| --- | --- |
| First Maru (Hiragana) | `hiragana_handakuten_1` |
| All Maru (Hiragana) | `hiragana_handakuten_all` |

**Combined Sounds**

| Badge Name | Achievement Key |
| --- | --- |
| First Combined Sound (Hiragana) | `hiragana_yoon_1` |
| All Combined Sounds (Hiragana) | `hiragana_yoon_all` |

**Double N Sound**

| Badge Name | Achievement Key |
| --- | --- |
| Double N Sound (Hiragana) | `hiragana_n_gemination_all` |
| All Hiragana | `hiragana_all` |

### Katakana

**Overall**

| Badge Name | Achievement Key |
| --- | --- |
| First Katakana | `katakana_total_1` |
| 5 Katakana | `katakana_total_5` |
| 10 Katakana | `katakana_total_10` |
| 20 Katakana | `katakana_total_20` |
| 30 Katakana | `katakana_total_30` |
| 40 Katakana | `katakana_total_40` |
| Basic Sounds Master (Katakana) | `katakana_seion_all` |

**Ten-Ten**

| Badge Name | Achievement Key |
| --- | --- |
| First Ten-Ten (Katakana) | `katakana_dakuten_1` |
| 5 Ten-Ten (Katakana) | `katakana_dakuten_5` |
| 10 Ten-Ten (Katakana) | `katakana_dakuten_10` |
| All Ten-Ten (Katakana) | `katakana_dakuten_all` |

**Maru**

| Badge Name | Achievement Key |
| --- | --- |
| First Maru (Katakana) | `katakana_handakuten_1` |
| All Maru (Katakana) | `katakana_handakuten_all` |

**Combined Sounds**

| Badge Name | Achievement Key |
| --- | --- |
| First Combined Sound (Katakana) | `katakana_yoon_1` |
| All Combined Sounds (Katakana) | `katakana_yoon_all` |

**Double Consonants**

| Badge Name | Achievement Key |
| --- | --- |
| First Double Consonant | `katakana_sokuon_1` |
| All Double Consonants | `katakana_sokuon_all` |

**Double N Sound**

| Badge Name | Achievement Key |
| --- | --- |
| Double N Sound (Katakana) | `katakana_n_gemination_all` |

**Long Vowels**

| Badge Name | Achievement Key |
| --- | --- |
| First Long Vowel | `katakana_choonpu_1` |
| All Long Vowels | `katakana_choonpu_all` |

**Foreign Sound Combos**

| Badge Name | Achievement Key |
| --- | --- |
| First Foreign Sound Combo | `katakana_extended_1` |
| 5 Foreign Sound Combos | `katakana_extended_5` |
| All Foreign Sound Combos | `katakana_extended_all` |
| All Katakana | `katakana_all` |

### Kana

| Badge Name | Achievement Key |
| --- | --- |
| All Kana | `kana_all` |

### Reading Tests

**Hiragana**

| Badge Name | Achievement Key |
| --- | --- |
| Hiragana Reading Test | `hiragana_test` |
| Hiragana Reading Test — Perfect Score | `hiragana_test_100` |

**Katakana**

| Badge Name | Achievement Key |
| --- | --- |
| Katakana Reading Test | `katakana_test` |
| Katakana Reading Test — Perfect Score | `katakana_test_100` |

### Kanji

**N5**

| Badge Name | Achievement Key |
| --- | --- |
| First Kanji | `kanji_total_1` |
| 5 Kanji | `kanji_total_5` |
| 10 Kanji | `kanji_total_10` |
| 50 Kanji | `kanji_total_50` |
| All N5 Kanji | `kanji_n5_all` |

**N4**

| Badge Name | Achievement Key |
| --- | --- |
| First N4 Kanji | `kanji_n4_1` |
| 100 Kanji | `kanji_total_100` |
| All N4 Kanji | `kanji_n4_all` |

**N3**

| Badge Name | Achievement Key |
| --- | --- |
| First N3 Kanji | `kanji_n3_1` |
| 500 Kanji | `kanji_total_500` |
| All N3 Kanji | `kanji_n3_all` |

**N2**

| Badge Name | Achievement Key |
| --- | --- |
| First N2 Kanji | `kanji_n2_1` |
| All N2 Kanji | `kanji_n2_all` |

**N1**

| Badge Name | Achievement Key |
| --- | --- |
| First N1 Kanji | `kanji_n1_1` |
| 1000 Kanji | `kanji_total_1000` |
| 1500 Kanji | `kanji_total_1500` |
| 2000 Kanji | `kanji_total_2000` |
| All N1 Kanji | `kanji_n1_all` |

### Vocabulary

**N5**

| Badge Name | Achievement Key |
| --- | --- |
| First Word | `word_total_1` |
| 5 Words | `word_total_5` |
| 10 Words | `word_total_10` |
| 50 Words | `word_total_50` |
| 100 Words | `word_total_100` |
| 500 Words | `word_total_500` |
| All N5 Words | `word_n5_all` |

**N4**

| Badge Name | Achievement Key |
| --- | --- |
| First N4 Word | `word_n4_1` |
| 1000 Words | `word_total_1000` |
| All N4 Words | `word_n4_all` |

**N3**

| Badge Name | Achievement Key |
| --- | --- |
| First N3 Word | `word_n3_1` |
| 1500 Words | `word_total_1500` |
| 2000 Words | `word_total_2000` |
| All N3 Words | `word_n3_all` |

**N2**

| Badge Name | Achievement Key |
| --- | --- |
| First N2 Word | `word_n2_1` |
| All N2 Words | `word_n2_all` |

**N1**

| Badge Name | Achievement Key |
| --- | --- |
| First N1 Word | `word_n1_1` |
| All N1 Words | `word_n1_all` |

### JLPT Levels

| Badge Name | Achievement Key |
| --- | --- |
| N5 Completed | `n5_completed` |
| N4 Completed | `n4_completed` |
| N3 Completed | `n3_completed` |
| N2 Completed | `n2_completed` |
| N1 Completed | `n1_completed` |

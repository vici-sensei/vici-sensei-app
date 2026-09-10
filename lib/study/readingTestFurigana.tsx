import type { ReactNode } from "react";
import { buildFuriganaSegments } from "@/lib/study/furigana";
import type { BrowseKanaEntry } from "@/lib/types";

const IDEOGRAPHIC_SPACE = "　";

/** kana_type values whose `character` column is an atomic sound unit (1-3 kana forming one mora
 * or one doubled-consonant/gemination group) rather than a whole example word -- excludes
 * rendaku/particle_reading/historical, whose entry_kind='example' rows are full words (てがみ,
 * わたしは, こゝろ, ...) that would wrongly swallow unrelated substrings during the greedy match
 * below. Every other BrowseKanaEntry["kana_type"] value is included, including choonpu (ケー ->
 * kee) and extended (ディ -> di, ヴァ -> va) -- both are just as atomic as yoon/sokuon and were
 * previously missing here by omission, which silently blanked the post-check romaji hint for any
 * katakana word containing a long vowel or an extended-katakana combo (most of them). A
 * Set().has() check (not a switch/===) so this doesn't fight BrowseKanaEntry's kana_type union. */
const ATOMIC_KANA_TYPES = new Set([
  "seion",
  "dakuten",
  "handakuten",
  "yoon",
  "sokuon",
  "choonpu",
  "extended",
  "n_gemination",
]);

/** Builds the character -> romaji lookup used by buildFullRomajiFuriganas, from the same
 * kana reference rows Browse renders (useHiraganaList/useKatakanaList, whichever matches the
 * reading test's own test_type). Longest entries are 3 characters (sokuon + yoon, e.g. っきゃ ->
 * kkya). */
export function buildKanaRomajiMap(entries: BrowseKanaEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.entry_kind === "rule" || !ATOMIC_KANA_TYPES.has(entry.kana_type)) continue;
    map.set(entry.character, entry.romaji);
  }
  return map;
}

/**
 * Builds a full romaji reading for `kana`, one ruby group per natural sound unit (yoon
 * digraph, sokuon/n-gemination + following kana, or a single plain kana), by greedily matching
 * the longest known combo at each position against `kanaRomajiMap`. Same array shape/convention
 * as ReadingTestSentence.particle_furiganas (parallel to Array.from(kana): a group's first
 * character holds the romaji, later characters in that group hold "-", unmatched characters
 * (punctuation, or a sokuon with nothing to attach to) hold "") -- rendered with the existing
 * renderWordWithFurigana, same as the particle-only hint shown before the user answers.
 *
 * `particleFuriganas`, when given, wins over the table lookup wherever it's set (は/を/へ read as
 * a grammatical particle sound differently than their normal kana reading) -- は/を/へ never
 * start a yoon/sokuon combo in this data, so overriding per-character here never splits a group.
 *
 * Two sound units are synthesized instead of looked up, since Browse's kana tables don't carry
 * literal rows for either (removed from public.hiragana/public.katakana on purpose -- see
 * 20260829_drop_sokuon_yoon_examples.sql and 20260829_drop_hiragana_choonpu_section.sql -- so
 * re-adding rows here would bring back Browse sections that were deliberately dropped):
 *  - Sokuon (っ/ッ) immediately followed by a yoon digraph (two kana, e.g. しょ) that IS in the
 *    table: doubles the digraph's first consonant, the same rule the table already encodes for
 *    sokuon + a single kana (っし -> sshi doubles the "s" in "shi"). A small ゃ/ゅ/ょ never stands
 *    on its own, so whenever it directly follows a sokuon + kana pair, that pair can only be a
 *    yoon digraph being doubled -- never sokuon + a bare kana with the yoon trailing separately.
 *  - Chōonpu (ー) with no literal "<kana>ー" entry: it always just repeats the vowel of the mora
 *    before it, so its romaji is read off the vowel most recently assigned. These positions are
 *    also returned separately as `choonpuHints`, parallel to `particleFuriganas` -- ー doesn't
 *    occur in standard hiragana at all, so a hiragana word using it genuinely needs the reading
 *    spelled out, same as は/を/へ. It's on the caller (ReadingTestSentenceRow) to decide whether
 *    to actually merge `choonpuHints` into its always-shown/blue hint treatment -- katakana uses
 *    ー constantly, so hinting every occurrence there would give away a good chunk of that test.
 */
export function buildFullRomajiFuriganas(
  kana: string,
  kanaRomajiMap: Map<string, string>,
  particleFuriganas: (string | null)[] | null
): { furiganas: string[]; choonpuHints: (string | null)[] } {
  const chars = Array.from(kana);
  const result: string[] = new Array(chars.length).fill("");
  const choonpuHints: (string | null)[] = new Array(chars.length).fill(null);
  let lastRomaji: string | null = null;

  const assignGroup = (start: number, length: number, romaji: string) => {
    result[start] = romaji;
    for (let j = start + 1; j < start + length; j++) result[j] = "-";
    lastRomaji = romaji;
  };

  let i = 0;
  while (i < chars.length) {
    const particleOverride = particleFuriganas?.[i];
    if (particleOverride) {
      result[i] = particleOverride;
      lastRomaji = particleOverride;
      i += 1;
      continue;
    }

    const literal3 = i + 3 <= chars.length ? chars.slice(i, i + 3).join("") : null;
    if (literal3 && kanaRomajiMap.has(literal3)) {
      assignGroup(i, 3, kanaRomajiMap.get(literal3)!);
      i += 3;
      continue;
    }

    if ((chars[i] === "っ" || chars[i] === "ッ") && i + 3 <= chars.length) {
      const digraphRomaji = kanaRomajiMap.get(chars.slice(i + 1, i + 3).join(""));
      if (digraphRomaji) {
        assignGroup(i, 3, digraphRomaji[0] + digraphRomaji);
        i += 3;
        continue;
      }
    }

    const literal2 = i + 2 <= chars.length ? chars.slice(i, i + 2).join("") : null;
    if (literal2 && kanaRomajiMap.has(literal2)) {
      assignGroup(i, 2, kanaRomajiMap.get(literal2)!);
      i += 2;
      continue;
    }

    if (chars[i] === "ー" && lastRomaji) {
      const vowel = lastRomaji[lastRomaji.length - 1];
      result[i] = vowel;
      choonpuHints[i] = vowel;
      lastRomaji = vowel;
      i += 1;
      continue;
    }

    const single = kanaRomajiMap.get(chars[i]) ?? "";
    result[i] = single;
    if (single) lastRomaji = single;
    i += 1;
  }

  return { furiganas: result, choonpuHints };
}

const DEFAULT_FURIGANA_CLASS = "text-base font-normal text-text-muted";
// Always-shown hints (は/を/へ particle readings, and hiragana's chōonpu vowel-extension hints --
// see buildFullRomajiFuriganas's choonpuHints) are visible before the user answers, unlike the
// rest of the romaji reading -- kept in this faded blue both before and after checking, so the
// user can always tell which readings were given upfront from the ones they had to work out.
const HINT_FURIGANA_CLASS = "text-base font-normal text-accent-blue/70";

/** Renders one "　"-delimited grouping's ruby/rt pairs, coloring a segment's furigana blue when it
 * came from `hintFuriganas` (given, not computed) rather than the reading-lookup table. Each
 * hinted position is exactly one character (は/を/へ never start a yoon/sokuon combo, and ー is
 * never grouped with a following character), so a segment is "hinted" whenever its own start
 * index carries a hint override -- never split across a multi-character segment. */
function renderFuriganaGroup(text: string, furiganas: string[] | null, hintFuriganas: (string | null)[] | null, keyPrefix: string): ReactNode {
  const segments = buildFuriganaSegments(text, furiganas ?? undefined);
  const lastFuriganaIndex = segments.reduce((acc, s, idx) => (s.furigana ? idx : acc), -1);
  let pos = 0;
  return segments.map((segment, i) => {
    const segStart = pos;
    pos += segment.text.length;
    if (!segment.furigana) return <span key={`${keyPrefix}-${i}`}>{segment.text}</span>;
    const furiganaClassName = hintFuriganas?.[segStart] ? HINT_FURIGANA_CLASS : DEFAULT_FURIGANA_CLASS;
    return (
      <ruby key={`${keyPrefix}-${i}`} className={i === lastFuriganaIndex ? "" : "mr-1"}>
        {segment.text}
        <rt
          className={`mb-1 select-none ${furiganaClassName} ${
            segment.text.length > 1 ? "rounded-md bg-white/5 px-1 pb-1" : "pb-1"
          }`}
        >
          {segment.furigana}
        </rt>
      </ruby>
    );
  });
}

/**
 * Renders a reading-test sentence so that each "　"-delimited kana grouping (see
 * 20260902_reading_test_hiragana_spacing.sql -- one grouping per romaji word, comma/quote-attached
 * punctuation included) always stays on one line. Plain ruby/rt wraps every kana in its own inline
 * element, and CJK line-breaking allows a break between any two of them -- including inside a
 * grouping -- so without this, a grouping could split across two lines. Each grouping gets its own
 * whitespace-nowrap inline-block; the "　" itself is left as an ordinary breakable character outside
 * those blocks, so the sentence still wraps between groupings when it needs to.
 */
export function renderReadingTestSentence(
  kana: string,
  furiganas: (string | null)[] | string[] | null,
  hintFuriganas: (string | null)[] | null = null
): ReactNode[] {
  const chars = Array.from(kana);
  const alignedFuriganas = furiganas && furiganas.length === chars.length ? (furiganas as string[]) : null;
  const nodes: ReactNode[] = [];
  let start = 0;

  const flushGroup = (end: number) => {
    if (end <= start) return;
    nodes.push(
      <span key={`g${start}`} className="inline-block whitespace-nowrap">
        {renderFuriganaGroup(
          chars.slice(start, end).join(""),
          alignedFuriganas?.slice(start, end) ?? null,
          hintFuriganas?.slice(start, end) ?? null,
          `g${start}`
        )}
      </span>
    );
  };

  chars.forEach((char, i) => {
    if (char === IDEOGRAPHIC_SPACE) {
      flushGroup(i);
      nodes.push(<span key={`sp${i}`}>{char}</span>);
      start = i + 1;
    }
  });
  flushGroup(chars.length);

  return nodes;
}

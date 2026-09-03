import type { ReactNode } from "react";
import { buildFuriganaSegments } from "@/lib/study/furigana";
import type { BrowseKanaEntry } from "@/lib/types";

const IDEOGRAPHIC_SPACE = "　";

/** kana_type values whose `character` column is an atomic sound unit (1-3 kana forming one mora
 * or one doubled-consonant/gemination group) rather than a whole example word -- excludes
 * rendaku/particle_reading/historical, whose entry_kind='example' rows are full words (てがみ,
 * わたしは, こゝろ, ...) that would wrongly swallow unrelated substrings during the greedy match
 * below. A Set().has() check (not a switch/===) so this doesn't fight BrowseKanaEntry's
 * kana_type union, which doesn't list those three DB-only values. */
const ATOMIC_KANA_TYPES = new Set(["seion", "dakuten", "handakuten", "yoon", "sokuon", "n_gemination"]);

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
 */
export function buildFullRomajiFuriganas(
  kana: string,
  kanaRomajiMap: Map<string, string>,
  particleFuriganas: (string | null)[] | null
): string[] {
  const chars = Array.from(kana);
  const result: string[] = new Array(chars.length).fill("");

  let i = 0;
  while (i < chars.length) {
    const particleOverride = particleFuriganas?.[i];
    if (particleOverride) {
      result[i] = particleOverride;
      i += 1;
      continue;
    }

    const groupLength = [3, 2].find((len) => i + len <= chars.length && kanaRomajiMap.has(chars.slice(i, i + len).join("")));
    if (groupLength) {
      result[i] = kanaRomajiMap.get(chars.slice(i, i + groupLength).join(""))!;
      for (let j = i + 1; j < i + groupLength; j++) result[j] = "-";
      i += groupLength;
      continue;
    }

    result[i] = kanaRomajiMap.get(chars[i]) ?? "";
    i += 1;
  }

  return result;
}

const DEFAULT_FURIGANA_CLASS = "text-base font-normal text-text-muted";
// Particle-reading hints (は/を/へ) are visible before the user answers, unlike the rest of the
// romaji reading -- kept in this faded blue both before and after checking, so the user can always
// tell which readings were given upfront from the ones they had to work out.
const PARTICLE_FURIGANA_CLASS = "text-base font-normal text-accent-blue/70";

/** Renders one "　"-delimited grouping's ruby/rt pairs, coloring a segment's furigana blue when it
 * came from `particleFuriganas` (given, not computed) rather than the reading-lookup table. Each
 * particle override is exactly one character (は/を/へ never start a yoon/sokuon combo), so a
 * segment is "particle" whenever its own start index carries a particle override -- never split
 * across a multi-character segment. */
function renderFuriganaGroup(text: string, furiganas: string[] | null, particleFuriganas: (string | null)[] | null, keyPrefix: string): ReactNode {
  const segments = buildFuriganaSegments(text, furiganas ?? undefined);
  const lastFuriganaIndex = segments.reduce((acc, s, idx) => (s.furigana ? idx : acc), -1);
  let pos = 0;
  return segments.map((segment, i) => {
    const segStart = pos;
    pos += segment.text.length;
    if (!segment.furigana) return <span key={`${keyPrefix}-${i}`}>{segment.text}</span>;
    const furiganaClassName = particleFuriganas?.[segStart] ? PARTICLE_FURIGANA_CLASS : DEFAULT_FURIGANA_CLASS;
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
  particleFuriganas: (string | null)[] | null = null
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
          particleFuriganas?.slice(start, end) ?? null,
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

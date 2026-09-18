/** Rewrites a typed romaji search query from the spellings the "Extended romaji" setting accepts
 * for answers (Kunrei/Nihon-style si, ti, tu, hu, zi, sya, tya, zya, ..., and IME keys like ca/ci)
 * into the standard Hepburn spelling public.vocabulary.romaji_reading uses -- so syasin finds 写真
 * (shashin) and huyu finds 冬 (fuyu).
 *
 * Deliberately small and syllable-level: it does not enumerate variants (that is what
 * matchesExtendedRomaji is for when checking an answer) and it does not touch long vowels
 * (kohi will not find コーヒー). Meant to be used only as a fallback when the original query found
 * nothing -- the search RPC also matches English meanings, so rewriting a query unconditionally
 * would turn "sit" into "shit" and "tutor" into "tsutor".
 *
 * Returns the standardized query, or null when there is nothing to rewrite: anything that is not
 * plain a-z (kana, kanji, spaces, apostrophes, digits) is left alone, and so is a query that is
 * already standard. */

/** Non-standard spelling -> Hepburn. Applied longest-match-first at each position. */
const REWRITES: [from: string, to: string][] = [
  // yoon in Kunrei/Nihon (sya) and IME (cya, jya, dya) spellings
  ["sya", "sha"], ["syu", "shu"], ["syo", "sho"],
  ["tya", "cha"], ["tyu", "chu"], ["tyo", "cho"],
  ["cya", "cha"], ["cyu", "chu"], ["cyo", "cho"],
  ["zya", "ja"], ["zyu", "ju"], ["zyo", "jo"],
  ["jya", "ja"], ["jyu", "ju"], ["jyo", "jo"],
  ["dya", "ja"], ["dyu", "ju"], ["dyo", "jo"],
  // single syllables
  ["si", "shi"], ["ti", "chi"], ["tu", "tsu"], ["hu", "fu"], ["zi", "ji"], ["di", "ji"], ["du", "zu"],
  // IME keys: c is never Hepburn on its own (only ch/cch), so c + vowel is always a k/s spelling
  ["ci", "shi"], ["ca", "ka"], ["cu", "ku"], ["ce", "se"], ["co", "ko"],
];

/** Standard syllables that contain a key above ("hu" inside "shu"/"chu") -- matched first so the
 * greedy scan does not split them. */
const KEEP = ["shu", "chu"];

const TABLE: [string, string][] = [...KEEP.map((s): [string, string] => [s, s]), ...REWRITES].sort(
  (a, b) => b[0].length - a[0].length,
);

export function standardizeRomajiQuery(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!/^[a-z]+$/.test(q)) return null;
  let out = "";
  let i = 0;
  while (i < q.length) {
    const hit = TABLE.find(([from]) => q.startsWith(from, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += q[i];
      i++;
    }
  }
  return out === q ? null : out;
}

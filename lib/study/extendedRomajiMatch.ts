import type { KanaExtendedRomaji } from "@/lib/types";

/** What the "Extended romaji" setting accepts for a whole word, decided by walking the word's
 * kana_reading instead of storing every spelling: public.vocabulary would need one array per word,
 * and a long compound (朝鮮民主主義人民共和国) has hundreds of thousands of combinations, while
 * checking one typed answer against the kana is a tiny walk. Same rules public.test.extended_romaji
 * was generated with (20261229_add_extended_romaji_to_test.sql):
 *
 *  - every kana contributes its own spellings -- its romaji plus the "direct" values of its
 *    extended_romaji (letters a-z only; composed key sequences such as ltuci/xtsuchi are left out)
 *    -- and the answer may use any combination of them;
 *  - a sokuon (っ/ッ) uses the combined っ+kana row when one exists (っち: cchi, tchi, tti); without
 *    one the consonant is simply doubled (っぴゃ: ppya, っしょ: ssho/ssyo);
 *  - a long vowel (ー, or a vowel kana repeating the previous vowel / う after お) may be spelled
 *    out, dropped (koohii -> kohi) or written with h after o (ookii -> ohkii);
 *  - ん also accepts "m" before a kana starting with b/p/m (enpitsu -> empitsu).
 *
 * Two exceptions to "combine per-kana spellings":
 *  - a word that IS a single row of the kana tables (ヒャ, トゥ, ヴ, ッブ, め...) also accepts that
 *    row's whole extended_romaji, composed key sequences and all -- exactly what the kana cards
 *    accept for the same character, so a reading-test word made of one kana behaves like its kana
 *    card (in addition to, never instead of, the per-kana walk below);
 *  - こんにちは / こんばんは end in は read "wa" (a fixed expression, not the particle rule), so that
 *    last は also accepts "wa".
 *
 * `answer` must already be lowercased letters only (kanjiReadingMatch's normalizeCompare). Returns
 * false when the word has a kana with no row in the tables, so it never accepts on a guess. */

type Script = "hiragana" | "katakana";
type Units = KanaExtendedRomaji["units"];

const VOWELS = "aiueo";
const PURE_VOWEL: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
};
// Same vowel twice, or お+う: what counts as a long vowel written out in kana.
const LONG_PAIRS = new Set(["aa", "ii", "uu", "ee", "oo", "ou"]);
const SMALL_KANA = new Set([..."ゃゅょぁぃぅぇぉャュョァィゥェォ"]);
// Fixed expressions whose last は is read "wa".
const ENDS_IN_WA = new Set(["こんにちは", "こんばんは"]);

/** Kana romaji-tables.tsv lists (its categories 1-7) but public.hiragana / public.katakana have no
 * row for -- rare loanword combinations (ツァ, フュ, ヴュ, ...), archaic ゐ/ゑ, ヷ-ヺ, and the
 * sokuon combinations the tables leave out (っしゃ, っふ, ...). Keyed by hiragana form (katakana
 * looks it up through toHiragana; ヷ-ヺ have no hiragana form and are keyed as themselves). Each
 * value is Hepburn first, then the other systems' and direct keyboard spellings, exactly what the
 * DB rows hold; only consulted when the DB has no row, so adding one there overrides it. Kept in
 * code on purpose: adding rows to the tables would also put them in Browse and the study queue. */
const FALLBACK_UNITS: Record<string, string[]> = {
  "ゐ": ["i", "wi", "wyi"],
  "ゑ": ["e", "we", "wye"],
  "ぢゃ": ["ja", "zya", "dya", "jya"],
  "ぢゅ": ["ju", "zyu", "dyu", "jyu"],
  "ぢょ": ["jo", "zyo", "dyo", "jyo"],
  "ふゅ": ["fyu", "hwyu"],
  "てゅ": ["tyu", "teyu", "thu", "t'yu"],
  "でゅ": ["dyu", "deyu", "dhu", "d'yu"],
  "ゔゅ": ["vyu", "byu"],
  "つぁ": ["tsa", "tsua"],
  "つぃ": ["tsi", "tsui"],
  "つぇ": ["tse", "tsue"],
  "つぉ": ["tso", "tsuo"],
  "いぇ": ["ye", "ie"],
  "くぁ": ["kwa", "kua", "qa"],
  "くぃ": ["kwi", "kui", "qi"],
  "くぇ": ["kwe", "kue", "qe"],
  "くぉ": ["kwo", "kuo", "qo"],
  "ぐぁ": ["gwa", "gua"],
  "ぐぃ": ["gwi", "gui"],
  "ぐぇ": ["gwe", "gue"],
  "ぐぉ": ["gwo", "guo"],
  "すぃ": ["si", "sui", "swi"],
  "ずぃ": ["zi", "zui", "zwi"],
  "きぇ": ["kye", "kie"],
  "にぇ": ["nye", "nie"],
  "ひぇ": ["hye", "hie"],
  "みぇ": ["mye", "mie"],
  "りぇ": ["rye", "rie"],
  "ぎぇ": ["gye", "gie"],
  "びぇ": ["bye", "bie"],
  "ぴぇ": ["pye", "pie"],
  "ヷ": ["va"],
  "ヸ": ["vi"],
  "ヹ": ["ve"],
  "ヺ": ["vo"],
  "ぢぇ": ["je", "dye"],
  "っが": ["gga"],
  "っぎ": ["ggi"],
  "っげ": ["gge"],
  "っご": ["ggo"],
  "っざ": ["zza"],
  "っぜ": ["zze"],
  "っぞ": ["zzo"],
  "っだ": ["dda"],
  "っで": ["dde"],
  "っば": ["bba"],
  "っび": ["bbi"],
  "っべ": ["bbe"],
  "っぼ": ["bbo"],
  "っしゃ": ["ssha", "ssya"],
  "っしゅ": ["sshu", "ssyu"],
  "っしょ": ["ssho", "ssyo"],
  "っちゃ": ["tcha", "ttya", "ccha", "ccya"],
  "っちゅ": ["tchu", "ttyu", "cchu", "ccyu"],
  "っちょ": ["tcho", "ttyo", "ccho", "ccyo"],
  "っふ": ["ffu", "hhu"],
  "っじゃ": ["jja", "zzya", "jjya"],
  "っじゅ": ["jju", "zzyu", "jjyu"],
  "っじょ": ["jjo", "zzyo", "jjyo"],
};

/** Same normalization the callers compare with: letters only, lowercase. */
const normalize = (value: string) => value.replace(/[^\p{L}]/gu, "").toLowerCase();

type Token = { kind: "unit"; text: string } | { kind: "long" } | { kind: "sokuon" };

function shiftKana(value: string, from: [number, number], delta: number): string {
  return Array.from(value, (c) => {
    const cp = c.codePointAt(0)!;
    return cp >= from[0] && cp <= from[1] ? String.fromCodePoint(cp + delta) : c;
  }).join("");
}
const toKatakana = (s: string) => shiftKana(s, [0x3041, 0x3096], 0x60);
const toHiragana = (s: string) => shiftKana(s, [0x30a1, 0x30f6], -0x60);

/** Letters a-z only, no x/l (those only appear in composed key sequences like xtu/ltu/kilya) --
 * a spelling someone would actually type as romaji. Also used by Browse's kana search. */
export function isDirectSpelling(spelling: string): boolean {
  return /^[a-z]+$/.test(spelling) && !/[xl]/.test(spelling);
}

function tokenize(kana: string): Token[] {
  const chars = Array.from(kana);
  const tokens: Token[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "・") continue;
    if (c === "ー") {
      tokens.push({ kind: "long" });
      continue;
    }
    if (c === "っ" || c === "ッ") {
      tokens.push({ kind: "sokuon" });
      continue;
    }
    let text = c;
    while (i + 1 < chars.length && SMALL_KANA.has(chars[i + 1])) text += chars[++i];
    tokens.push({ kind: "unit", text });
  }
  return tokens;
}

const lastVowel = (spelling: string): string | null => (VOWELS.includes(spelling.slice(-1)) ? spelling.slice(-1) : null);

interface State {
  pos: number;
  /** The vowel the last spelled kana ended on -- what a following ー / vowel kana may lengthen. */
  vowel: string | null;
}

export function matchesExtendedRomaji(answer: string, kanaReading: string | null | undefined, units: Units): boolean {
  if (!answer || !kanaReading) return false;
  const script: Script = /^[ァ-ヺー・]+$/.test(kanaReading) ? "katakana" : "hiragana";
  const other: Script = script === "hiragana" ? "katakana" : "hiragana";
  const convert = script === "hiragana" ? toKatakana : toHiragana;

  // A row's spellings, canonical first; falls back to the same kana in the other script (the two
  // tables romanize identically, and e.g. katakana ッチ has no row of its own but っち does), then
  // to FALLBACK_UNITS for kana neither table has.
  function spellings(text: string): string[] | null {
    const row = units[script][text] ?? units[other][convert(text)] ?? FALLBACK_UNITS[toHiragana(text)];
    if (!row || row.length === 0) return null;
    return Array.from(new Set([row[0], ...row.slice(1).filter(isDirectSpelling)]));
  }

  // The whole word is one row of the kana tables: also accept that kana's own card answers. Only
  // ever adds to what the walk below accepts (a word like カー is both a row and two kana), never
  // replaces it.
  const wholeRow = units[script][kanaReading] ?? units[other][convert(kanaReading)];
  if (wholeRow && wholeRow.some((spelling) => normalize(spelling) === answer)) return true;

  const tokens = tokenize(kanaReading);
  let states = new Map<string, State>([["0|", { pos: 0, vowel: null }]]);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = new Map<string, State>();
    const add = (pos: number, vowel: string | null) => next.set(`${pos}|${vowel ?? ""}`, { pos, vowel });
    // Consumes `spelling` at the state's position; nothing to consume (a dropped vowel) always fits.
    const eat = (s: State, spelling: string, vowel: string | null) => {
      if (answer.startsWith(spelling, s.pos)) add(s.pos + spelling.length, vowel);
    };

    if (token.kind === "sokuon") {
      const following = tokens[i + 1];
      if (!following || following.kind !== "unit") return false;
      const combined = spellings((script === "hiragana" ? "っ" : "ッ") + following.text);
      let doubled: string[];
      if (combined) {
        doubled = combined;
      } else {
        const base = spellings(following.text);
        if (!base) return false;
        doubled = Array.from(
          new Set(
            base.flatMap((v) => (v.startsWith("ch") ? [`c${v}`, `t${v}`] : v.startsWith("sh") ? [`s${v}`] : [v[0] + v])),
          ),
        );
      }
      i++; // the sokuon consumed the kana it doubles
      for (const s of states.values()) for (const v of doubled) eat(s, v, lastVowel(v));
    } else if (token.kind === "unit") {
      const spelled = spellings(token.text);
      if (!spelled) return false;
      const own = ENDS_IN_WA.has(kanaReading) && i === tokens.length - 1 && token.text === "は" ? [...spelled, "wa"] : spelled;
      const pure = PURE_VOWEL[token.text];
      const following = tokens[i + 1];
      let mAllowed = false;
      if ((token.text === "ん" || token.text === "ン") && following && following.kind === "unit") {
        const nextSpellings = spellings(following.text);
        mAllowed = !!nextSpellings && nextSpellings.some((v) => /^[bpm]/.test(v));
      }
      for (const s of states.values()) {
        for (const v of own) eat(s, v, lastVowel(v));
        if (mAllowed) eat(s, "m", null);
        if (pure && s.vowel && LONG_PAIRS.has(s.vowel + pure)) {
          add(s.pos, s.vowel); // long vowel written without its second vowel
          if (s.vowel === "o" && (pure === "o" || pure === "u")) eat(s, "h", null);
        }
      }
    } else {
      for (const s of states.values()) {
        const v = s.vowel;
        if (!v) continue; // ー right after nothing/a sokuon-less non-vowel has nothing to lengthen
        eat(s, v, v);
        add(s.pos, v);
        if (v === "o") eat(s, "h", null);
      }
    }

    if (next.size === 0) return false;
    states = next;
  }

  for (const s of states.values()) if (s.pos === answer.length) return true;
  return false;
}

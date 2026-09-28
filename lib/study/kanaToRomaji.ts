/** Kana -> standard (wapuro-style) Hepburn, for recognising a reading the student typed in romaji
 * when the only stored form is kana -- public.kanji.kun_readings/on_readings have no romaji column,
 * unlike public.vocabulary.romaji_reading. Long vowels come out spelled the way they are written
 * (おう -> ou, ー -> the previous vowel again), which is what a student types on a keyboard; the
 * "Extended romaji" setting's looser spellings (tu, si, dropped long vowels...) are handled by
 * matchesExtendedRomaji, never here.
 *
 * Returns null when the text contains anything this table can't romanize, so a caller never
 * accepts an answer on a partial guess. */

const BASE: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
};

/** Two-kana combinations (yoon and the loanword digraphs), matched before single kana. */
const DIGRAPHS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho", じゃ: "ja", じゅ: "ju", じょ: "jo",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo", ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo", りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  しぇ: "she", じぇ: "je", ちぇ: "che",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du", てゅ: "tyu", でゅ: "dyu",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", ふゅ: "fyu",
  うぃ: "wi", うぇ: "we", うぉ: "wo", いぇ: "ye",
  ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
  つぁ: "tsa", つぃ: "tsi", つぇ: "tse", つぉ: "tso",
  くぁ: "kwa", ぐぁ: "gwa",
};

/** Katakana -> hiragana (ヷ-ヺ have no hiragana counterpart and are left as-is, then rejected). */
export function toHiragana(value: string): string {
  return Array.from(value, (c) => {
    const cp = c.codePointAt(0)!;
    return cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : c;
  }).join("");
}

export function kanaToRomaji(kana: string): string | null {
  const chars = Array.from(toHiragana(kana));
  let out = "";
  let pendingSokuon = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "・" || c === " " || c === "　") continue;
    if (c === "っ") {
      if (pendingSokuon) return null;
      pendingSokuon = true;
      continue;
    }
    if (c === "ー") {
      const vowel = out.slice(-1);
      if (!"aiueo".includes(vowel) || !vowel) return null;
      out += vowel;
      continue;
    }
    let romaji: string | undefined;
    const pair = c + (chars[i + 1] ?? "");
    if (DIGRAPHS[pair]) {
      romaji = DIGRAPHS[pair];
      i++;
    } else {
      romaji = BASE[c];
    }
    if (romaji === undefined) return null;
    if (pendingSokuon) {
      // っち -> tchi (Hepburn); everything else doubles its first consonant. A sokuon before a
      // vowel or ん has nothing to double.
      if (!/^[bcdfghjkmprstvwyz]/.test(romaji)) return null;
      out += romaji.startsWith("ch") ? "t" : romaji[0];
      pendingSokuon = false;
    }
    out += romaji;
  }
  if (pendingSokuon) return null;
  return out || null;
}

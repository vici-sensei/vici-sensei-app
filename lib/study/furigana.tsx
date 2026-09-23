import type { ReactNode } from "react";

interface FuriganaSegment {
  text: string;
  furigana: string | null;
}

export function buildFuriganaSegments(word: string, furiganas: string[] | null | undefined): FuriganaSegment[] {
  const chars = Array.from(word);
  if (!furiganas || furiganas.length !== chars.length) {
    return [{ text: word, furigana: null }];
  }
  const segments: FuriganaSegment[] = [];
  let i = 0;
  while (i < chars.length) {
    const reading = furiganas[i];
    if (reading && reading !== "-") {
      let j = i + 1;
      while (j < chars.length && furiganas[j] === "-") j++;
      segments.push({ text: chars.slice(i, j).join(""), furigana: reading });
      i = j;
    } else {
      segments.push({ text: chars[i], furigana: null });
      i++;
    }
  }
  return segments;
}

/** True for a kanji character -- any Han-script char except 々, which only repeats the kanji
 * before it and has no meaning of its own. */
export function isKanjiChar(char: string): boolean {
  return char !== "々" && /\p{Script=Han}/u.test(char);
}

/** `renderText`, when given, replaces each segment's plain base text (never the furigana) -- e.g.
 * WordPreviewRow wraps every kanji in its own long-pressable span. */
export function renderWordWithFurigana(
  word: string,
  furiganas: string[] | null | undefined,
  furiganaClassName = "text-base font-normal text-text-muted",
  furiganaBgClassName = "bg-white/5",
  furiganaSelectable = false,
  renderText: (text: string) => ReactNode = (text) => text
): ReactNode {
  const segments = buildFuriganaSegments(word, furiganas);
  const lastFuriganaIndex = segments.reduce((acc, s, idx) => (s.furigana ? idx : acc), -1);
  return segments.map((segment, i) =>
    segment.furigana ? (
      <ruby key={i} className={i === lastFuriganaIndex ? "" : "mr-[0.2em]"}>
        {renderText(segment.text)}
        <rt
          className={`mb-[0.5em] ${furiganaSelectable ? "" : "select-none"} ${furiganaClassName} ${
            segment.text.length > 1 ? `rounded-md ${furiganaBgClassName} px-1 pb-1` : ""
          }`}
        >
          {segment.furigana}
        </rt>
      </ruby>
    ) : (
      <span key={i}>{renderText(segment.text)}</span>
    )
  );
}

interface VocabularyWordFields {
  word: string;
  kana_reading: string | null;
  furiganas?: string[] | null;
  /** Missing (an older cached row, or an RPC not yet exposing it) counts as false. */
  usually_kana?: boolean | null;
}

/** True when a vocabulary word is flagged usually_kana (JMdict "uk") and has a kana reading to show instead. */
export function showsKanaOnly(v: Pick<VocabularyWordFields, "kana_reading" | "usually_kana">): boolean {
  return v.usually_kana === true && !!v.kana_reading;
}

/** Plain-text counterpart of renderVocabularyWord, for places that can't render ruby markup. */
export function vocabularyDisplayText(v: Pick<VocabularyWordFields, "word" | "kana_reading" | "usually_kana">): string {
  return showsKanaOnly(v) ? (v.kana_reading as string) : v.word;
}

/** A usually_kana word is shown as its kana reading with no furigana -- nobody reads it written in
 * kanji -- anything else goes through renderWordWithFurigana. The optional args are its own. */
export function renderVocabularyWord(
  v: VocabularyWordFields,
  furiganaClassName?: string,
  furiganaBgClassName?: string,
  furiganaSelectable?: boolean
): ReactNode {
  if (showsKanaOnly(v)) return v.kana_reading;
  return renderWordWithFurigana(v.word, v.furiganas, furiganaClassName, furiganaBgClassName, furiganaSelectable);
}

// Shows furigana above every kanji in the word except the one being tested
// (so the target's reading isn't given away before the user answers) and
// except any "sibling" kanji the server has flagged as known (known_kanji_chars) --
// either its exact reading is already mastered, or its own JLPT level is lower
// than the level of the kanji being tested. If every character in a segment is
// known, that segment's furigana is hidden too. `renderText` works as in renderWordWithFurigana.
export function renderTargetWord(
  word: string,
  target: string,
  furiganas: string[] | null | undefined,
  knownKanjiChars?: string[] | null,
  renderText: (text: string) => ReactNode = (text) => text
): ReactNode {
  const idx = target ? word.indexOf(target) : -1;
  const segments = buildFuriganaSegments(word, furiganas);
  const lastFuriganaIndex = segments.reduce((acc, s, i) => (s.furigana ? i : acc), -1);
  const knownSet = new Set(knownKanjiChars ?? []);

  let pos = 0;
  return (
    <>
      {segments.map((segment, i) => {
        const segStart = pos;
        const segEnd = pos + segment.text.length;
        pos = segEnd;
        const overlapsTarget = idx !== -1 && segStart < idx + target.length && segEnd > idx;
        const isKnownSibling =
          !overlapsTarget && segment.text.length > 0 && [...segment.text].every((ch) => knownSet.has(ch));

        if (overlapsTarget) {
          const before = segment.text.slice(0, Math.max(idx, segStart) - segStart);
          const mid = segment.text.slice(Math.max(idx, segStart) - segStart, Math.min(idx + target.length, segEnd) - segStart);
          const after = segment.text.slice(Math.min(idx + target.length, segEnd) - segStart);
          return (
            <span key={i}>
              {renderText(before)}
              {renderText(mid)}
              {renderText(after)}
            </span>
          );
        }
        if (isKnownSibling) {
          return <span key={i}>{renderText(segment.text)}</span>;
        }
        if (segment.furigana) {
          return (
            <ruby key={i} className={i === lastFuriganaIndex ? "" : "mr-[0.2em]"}>
              {renderText(segment.text)}
              <rt
                className={`mb-[0.5em] select-none text-base font-normal text-text-muted ${
                  segment.text.length > 1 ? "rounded-md bg-white/5 px-1 pb-1" : ""
                }`}
              >
                {segment.furigana}
              </rt>
            </ruby>
          );
        }
        return <span key={i}>{renderText(segment.text)}</span>;
      })}
    </>
  );
}

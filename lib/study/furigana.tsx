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

export function renderWordWithFurigana(word: string, furiganas: string[] | null | undefined): ReactNode {
  const segments = buildFuriganaSegments(word, furiganas);
  const lastFuriganaIndex = segments.reduce((acc, s, idx) => (s.furigana ? idx : acc), -1);
  return segments.map((segment, i) =>
    segment.furigana ? (
      <ruby key={i} className={i === lastFuriganaIndex ? "" : "mr-[0.2em]"}>
        {segment.text}
        <rt
          className={`mb-[0.5em] select-none text-base font-normal text-text-muted ${
            segment.text.length > 1 ? "rounded-md bg-white/5 px-1 pb-1" : ""
          }`}
        >
          {segment.furigana}
        </rt>
      </ruby>
    ) : (
      <span key={i}>{segment.text}</span>
    )
  );
}

// Shows furigana above every kanji in the word except the one being tested,
// so the target's reading isn't given away before the user answers.
export function renderTargetWord(word: string, target: string, furiganas: string[] | null | undefined): ReactNode {
  const idx = target ? word.indexOf(target) : -1;
  const segments = buildFuriganaSegments(word, furiganas);
  const lastFuriganaIndex = segments.reduce((acc, s, i) => (s.furigana ? i : acc), -1);

  let pos = 0;
  return (
    <>
      {segments.map((segment, i) => {
        const segStart = pos;
        const segEnd = pos + segment.text.length;
        pos = segEnd;
        const overlapsTarget = idx !== -1 && segStart < idx + target.length && segEnd > idx;

        if (overlapsTarget) {
          const before = segment.text.slice(0, Math.max(idx, segStart) - segStart);
          const mid = segment.text.slice(Math.max(idx, segStart) - segStart, Math.min(idx + target.length, segEnd) - segStart);
          const after = segment.text.slice(Math.min(idx + target.length, segEnd) - segStart);
          return (
            <span key={i}>
              {before}
              {mid}
              {after}
            </span>
          );
        }
        if (segment.furigana) {
          return (
            <ruby key={i} className={i === lastFuriganaIndex ? "" : "mr-[0.2em]"}>
              {segment.text}
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
        return <span key={i}>{segment.text}</span>;
      })}
    </>
  );
}

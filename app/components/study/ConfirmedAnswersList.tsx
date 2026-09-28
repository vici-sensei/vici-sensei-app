import { FaCheck } from "react-icons/fa6";
import type { ConfirmedAlternate } from "@/lib/study/alternateAnswers";

interface Props {
  answers: ConfirmedAlternate[];
  subdued?: boolean;
}

/** Stacked checkmarks for answers already accepted mid-review (a homograph's sibling
 * reading/meaning, a reading typed on a meaning card, ... -- see lib/study/alternateAnswers.ts)
 * before the card's own target is confirmed. Shared by ReviewCardKanjiMeaning,
 * ReviewCardKanjiReading and ReviewCardVocabMeaning so every "confirm, then ask for the actual
 * target" flow looks and behaves identically. */
export function ConfirmedAnswersList({ answers, subdued }: Props) {
  if (answers.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {answers.map((answer) => (
        <div
          key={`${answer.kind}:${answer.text}`}
          className={`flex flex-wrap items-baseline justify-center gap-x-2 text-[1.3rem] font-bold ${subdued ? "text-white/70" : "text-white"}`}
        >
          <FaCheck className="self-center text-accent-green" />
          <span>{answer.text}</span>
          {answer.note && <span className="text-base font-normal text-text-muted">{alternateNote(answer)}</span>}
        </div>
      ))}
    </div>
  );
}

function alternateNote(answer: ConfirmedAlternate): string {
  switch (answer.kind) {
    case "kanji_meaning":
      return `(${answer.note})`;
    case "kanji_reading_part":
      return `(${answer.note} in this word)`;
    case "kanji_reading_elsewhere":
      return `(${answer.note}, not in this word)`;
    default:
      return `(${answer.note})`;
  }
}

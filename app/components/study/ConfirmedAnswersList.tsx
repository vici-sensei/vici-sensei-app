import { FaCheck } from "react-icons/fa6";

interface Props {
  answers: string[];
  subdued?: boolean;
}

/** Stacked checkmarks for answers already accepted mid-review (e.g. a homograph's
 * sibling reading/meaning) before the card's own target is confirmed. Shared by
 * ReviewCardKanjiReading and ReviewCardVocabMeaning so the two "confirm, then ask
 * for the actual target" flows look and behave identically. */
export function ConfirmedAnswersList({ answers, subdued }: Props) {
  if (answers.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {answers.map((answer) => (
        <div
          key={answer}
          className={`flex items-center justify-center gap-2 text-[1.3rem] font-bold ${subdued ? "text-white/70" : "text-white"}`}
        >
          <FaCheck className="text-accent-green" />
          <span>{answer}</span>
        </div>
      ))}
    </div>
  );
}

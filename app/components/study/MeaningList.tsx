import { FaCheck } from "react-icons/fa6";
import type { MatchedMeaning } from "@/lib/study/kanjiMeaningMatch";

interface Props {
  meanings: string[];
  matchedMeanings: MatchedMeaning[];
  correct: boolean;
}

function renderMeaning(meaning: string, match: MatchedMeaning | undefined) {
  if (!match) return meaning;
  if (match.highlight === "full") return <span className="text-accent-green">{meaning}</span>;

  // "core" match: only the part outside the parenthetical qualifier was typed.
  const parenMatch = meaning.match(/^(.*?)(\([^)]*\))(.*)$/);
  if (!parenMatch) return <span className="text-accent-green">{meaning}</span>;
  const [, before, paren, after] = parenMatch;
  return (
    <>
      {before && <span className="text-accent-green">{before}</span>}
      <span>{paren}</span>
      {after && <span className="text-accent-green">{after}</span>}
    </>
  );
}

export function MeaningList({ meanings, matchedMeanings, correct }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 text-[1.3rem] font-bold text-white">
      {correct && <FaCheck className="mr-2 inline text-accent-green" />}
      {meanings.map((meaning, i) => {
        const match = matchedMeanings.find((m) => m.meaning === meaning);
        return (
          <span key={i}>
            {renderMeaning(meaning, match)}
            {i < meanings.length - 1 && ", "}
          </span>
        );
      })}
    </div>
  );
}

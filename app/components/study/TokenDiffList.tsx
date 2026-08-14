import { FaCheck, FaXmark } from "react-icons/fa6";
import type { TokenResult } from "@/lib/study/kanjiMeaningMatch";

interface Props {
  tokens: TokenResult[];
}

export function TokenDiffList({ tokens }: Props) {
  return (
    <div className="mt-3 space-y-2.5 text-left">
      {tokens.map((token, i) => (
        <div
          key={i}
          className={`rounded-lg border px-4 py-3 ${
            token.correct ? "border-accent-green/20 bg-accent-green/[0.05]" : "border-accent-red/20 bg-accent-red/[0.05]"
          }`}
        >
          <div className="font-mono text-[1.05rem] leading-relaxed">
            {token.correct ? (
              <span className="inline-flex items-center gap-1.5 text-accent-green">
                <FaCheck /> {token.raw}
              </span>
            ) : (
              <>
                <span className="mr-1.5 inline-flex text-accent-red">
                  <FaXmark />
                </span>
                {token.userDiff?.map((c, ci) => (
                  <span key={ci} className={c.match ? "text-white" : "text-accent-red line-through decoration-2"}>
                    {c.char}
                  </span>
                ))}
              </>
            )}
          </div>
          {!token.correct && token.targetDiff && (
            <div className="mt-1 font-mono text-[0.9rem] leading-relaxed text-text-muted">
              {token.targetDiff.map((c, ci) => (
                <span key={ci} className={c.match ? "" : "font-bold text-accent-green"}>
                  {c.char}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

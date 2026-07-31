import type { TokenResult } from "@/lib/study/kanjiMeaningMatch";

interface Props {
  tokens: TokenResult[];
}

export function TokenDiffList({ tokens }: Props) {
  return (
    <div className="mt-5 space-y-2.5 text-left">
      {tokens.map((token, i) => (
        <div
          key={i}
          className={`rounded-lg border px-4 py-3 ${
            token.correct ? "border-accent-blue/20 bg-accent-blue/[0.05]" : "border-accent-red/20 bg-accent-red/[0.05]"
          }`}
        >
          <div className="font-mono text-[1.05rem] leading-relaxed">
            {token.correct ? (
              <span className="text-accent-blue">✓ {token.raw}</span>
            ) : (
              <>
                <span className="text-accent-red">✗ </span>
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
                <span key={ci} className={c.match ? "" : "font-bold text-accent-blue"}>
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

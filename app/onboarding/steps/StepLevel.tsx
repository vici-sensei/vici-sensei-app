import { LevelGrid } from "@/app/components/ui/LevelGrid";
import { LevelRail } from "@/app/components/ui/LevelRail";
import type { JlptLevel } from "@/lib/srs/constants";

/** Shown in place of the level picker once the student has said they don't already know
 * hiragana/katakana -- their level is set to N5 automatically rather than chosen, so this
 * step becomes a read-through explaining what's coming next instead of a decision. */
function StepLevelKanaInfo() {
  return (
    <>
      <h1 className=" mb-8 text-[1.5rem] font-extrabold tracking-[-0.5px]">Your first milestone</h1>
      <LevelRail />
      <div className="mx-auto max-w-md space-y-2 text-left text-sm leading-[1.6] text-text-muted">
        <p>
          JLPT levels (N5 to N1) measure how much Japanese you know — N5 is the starting point, N1 is expert.
        </p>
        <p>
          You&apos;re starting at N5. Once you&apos;ve learned hiragana, katakana, and a few kanji, you&apos;ll be able to pick a different level anytime from Settings.
        </p>
      </div>
    </>
  );
}

export function StepLevel({
  level,
  onChange,
  knowsKana,
}: {
  level: JlptLevel | null;
  onChange: (level: JlptLevel) => void;
  /** Whether the student said they already know hiragana/katakana (StepKana) -- `false` renders
   * the informational variant above instead of the level picker. */
  knowsKana: boolean | null;
}) {
  if (knowsKana === false) return <StepLevelKanaInfo />;

  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">What JLPT level are you studying?</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        You can also include easier levels later, in Settings.
      </p>
      <LevelGrid value={level} onChange={onChange} cascade={false} />
    </>
  );
}

import { LevelGrid } from "@/app/components/ui/LevelGrid";
import type { JlptLevel } from "@/lib/srs/constants";

/** Shown in place of the level picker once the student has said they don't already know
 * hiragana/katakana -- their level is set to N5 automatically rather than chosen, so this
 * step becomes a read-through explaining what's coming next instead of a decision. */
function StepLevelKanaInfo() {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">Starting with hiragana and katakana</h1>
      <div className="mx-auto max-w-md space-y-4 text-left text-sm leading-[1.6] text-text-muted">
        <p>
          Japanese is written with three scripts. Hiragana and katakana are phonetic alphabets — each character is
          just a sound, like a letter. Kanji are the characters borrowed from Chinese, each carrying its own
          meaning. Vocabulary is built from all three together.
        </p>
        <p>
          JLPT levels (N5 through N1) measure overall Japanese proficiency, from beginner to fluent, and are what
          most textbooks and courses organize themselves around.
        </p>
        <p>
          You&apos;re starting at <span className="font-bold text-white">N5</span>, the beginner level — set
          automatically for now, since hiragana and katakana come before any JLPT level really applies.
        </p>
        <p>
          Once you&apos;ve learned both alphabets, you can start kanji and vocabulary any time you choose, from
          Settings. That&apos;s also when you&apos;ll be able to pick a different JLPT level, if N5 isn&apos;t the
          right starting point for you.
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

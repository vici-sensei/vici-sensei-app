import { LevelGrid } from "@/app/components/ui/LevelGrid";
import type { JlptLevel } from "@/lib/srs/constants";

export function StepLevel({ level, onChange }: { level: JlptLevel | null; onChange: (level: JlptLevel) => void }) {
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

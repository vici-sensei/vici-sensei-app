import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";

/** Blue (N5) to gold (N1) -- the two endpoints are real design tokens; the three in-between
 * stops are just that gradient read at 25/50/75%, so the rail always looks like one continuous
 * scale rather than two unrelated colors with three arbitrary dots between them. */
const LEVEL_RAIL_COLORS: Record<JlptLevel, string> = {
  N5: "#00d2ff",
  N4: "#40d2bf",
  N3: "#80d280",
  N2: "#bfd240",
  N1: "#ffd200",
};

const LEVEL_RAIL_TAGS: Partial<Record<JlptLevel, string>> = {
  N5: "Starting point",
  N1: "Expert",
};

/** The N5 -> N1 scale shown in StepLevelKanaInfo (onboarding) and NewKanjiBasicsIntroCard's
 * "JLPT levels" step -- N5 and N1 are the large, labeled endpoints (the two values that actually
 * matter here); N4/N3/N2 are small unlabeled-tag ticks in between so the rail reads as a
 * continuous scale instead of just two dots. Always points "You are here" at N5 -- every caller
 * shows this to a student who is either starting there or about to be told they are. */
export function LevelRail() {
  return (
    <div className="mx-auto mt-7 mb-6 w-full max-w-md">
      <div
        className="relative mx-[11px] h-1.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${LEVEL_RAIL_COLORS.N5} 0%, ${LEVEL_RAIL_COLORS.N1} 100%)` }}
      >
        <span className="absolute -top-[1.9rem] left-[-2px] flex items-center gap-1 text-[0.62rem] font-extrabold uppercase tracking-[0.05em] after:h-2.5 after:w-px after:bg-current after:opacity-60" style={{ color: LEVEL_RAIL_COLORS.N5 }}>
          You are here
        </span>
        {JLPT_LEVELS.map((level, i) => {
          const pos = (i / (JLPT_LEVELS.length - 1)) * 100;
          const isEndpoint = i === 0 || i === JLPT_LEVELS.length - 1;
          const color = LEVEL_RAIL_COLORS[level];
          return (
            <span
              key={level}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-main"
              style={{
                left: `${pos}%`,
                background: color,
                width: isEndpoint ? 11 : 6,
                height: isEndpoint ? 11 : 6,
                boxShadow: isEndpoint ? `0 0 10px ${color}73` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="relative mx-[11px] mt-[0.65rem] h-[2.3em]">
        {JLPT_LEVELS.map((level, i) => {
          const pos = (i / (JLPT_LEVELS.length - 1)) * 100;
          const isFirst = i === 0;
          const isLast = i === JLPT_LEVELS.length - 1;
          const isEndpoint = isFirst || isLast;
          // The two endpoints sit right at the track's edges -- centering their label on the dot
          // (like the three inner ticks) would push half the text past the viewport on narrow
          // screens, so they anchor to their own edge instead and only the inner ticks center.
          const anchor = isFirst ? "left-0 items-start text-left" : isLast ? "right-0 items-end text-right" : "-translate-x-1/2 items-center";
          return (
            <div
              key={level}
              className={`absolute top-0 flex flex-col gap-[0.28rem] ${anchor}`}
              style={{ left: isLast ? undefined : `${pos}%`, color: LEVEL_RAIL_COLORS[level] }}
            >
              <span className={`font-extrabold ${isEndpoint ? "text-[0.85rem]" : "text-[0.62rem] opacity-80"}`}>{level}</span>
              {LEVEL_RAIL_TAGS[level] && (
                <span className="text-[0.62rem] uppercase tracking-[0.03em] text-text-muted/70">{LEVEL_RAIL_TAGS[level]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

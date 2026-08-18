"use client";

import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";
import { FaCheck } from "react-icons/fa6";

const DESCRIPTIONS: Record<JlptLevel, string> = {
  N5: "Beginner",
  N4: "Elementary",
  N3: "Intermediate",
  N2: "Advanced",
  N1: "Expert",
};

interface LevelGridProps {
  /** The most advanced level selected, or `null` if the user hasn't picked one yet. */
  value: JlptLevel | null;
  onChange: (level: JlptLevel) => void;
  /**
   * Whether/how far levels below `value` are also included — tints them to show they're active
   * too. `false`: only `value` is highlighted. `true`: every level down to N5 is included. A
   * specific `JlptLevel`: every level from that floor up to `value` is included.
   */
  cascade: boolean | JlptLevel;
  size?: "md" | "sm";
}

/** Shared JLPT level selector — used identically by /onboarding and /settings/study. */
export function LevelGrid({ value, onChange, cascade, size = "md" }: LevelGridProps) {
  const maxIdx = value ? JLPT_LEVELS.indexOf(value) : -1;
  const floorIdx = cascade === false ? maxIdx : cascade === true ? 0 : JLPT_LEVELS.indexOf(cascade);

  const pillSize = size === "sm" ? "h-[62px] w-[62px] gap-0.5 rounded-xl" : "h-21 w-21 gap-1 rounded-2xl";

  return (
    <div className="flex flex-wrap justify-center gap-2.5">
      {JLPT_LEVELS.map((level, idx) => {
        const state = idx === maxIdx ? "selected" : idx >= floorIdx && idx < maxIdx ? "included" : "";
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`relative flex cursor-pointer flex-col items-center justify-center border font-sans transition-all duration-200 ${pillSize} ${
              state === "selected"
                ? "border-accent-red bg-accent-red shadow-[0_0_20px_var(--color-accent-red-glow)]"
                : state === "included"
                  ? "border-accent-red/25 bg-accent-red/[0.06]"
                  : "border-border-soft bg-white/[0.03] hover:border-white/20"
            }`}
          >
            <span
              className={`absolute -right-[7px] -top-[7px] h-5 w-5 items-center justify-center rounded-full border-2 border-bg-main ${
                state === "selected" ? "flex bg-white" : state === "included" ? "flex bg-accent-red" : "hidden bg-accent-red"
              }`}
            >
              <FaCheck className={`h-[11px] w-[11px] ${state === "selected" ? "text-accent-red" : "text-white"}`} />
            </span>
            <span
              className={`text-[1.15rem] font-extrabold ${
                state === "selected" || state === "" ? "text-white" : "text-[#ffb3ba]"
              } ${size === "sm" ? "text-base" : ""}`}
            >
              {level}
            </span>
            {size === "md" && (
              <span className={`text-[0.68rem] font-semibold ${state === "selected" ? "text-white" : "text-text-muted"}`}>
                {DESCRIPTIONS[level]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** All levels from N5 up to and including `mostAdvanced`, matching normalize_enabled_levels(). */
export function enabledLevelsFor(mostAdvanced: JlptLevel): JlptLevel[] {
  const idx = JLPT_LEVELS.indexOf(mostAdvanced);
  return JLPT_LEVELS.slice(0, idx + 1);
}

"use client";

import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";

const DESCRIPTIONS: Record<JlptLevel, string> = {
  N5: "Beginner",
  N4: "Elementary",
  N3: "Intermediate",
  N2: "Advanced",
  N1: "Expert",
};

interface LevelGridProps {
  /** The most advanced level selected — lower levels are implicitly included. */
  value: JlptLevel;
  onChange: (level: JlptLevel) => void;
  size?: "md" | "sm";
}

/** Shared JLPT level selector — used identically by /onboarding and /settings/study. */
export function LevelGrid({ value, onChange, size = "md" }: LevelGridProps) {
  const maxIdx = JLPT_LEVELS.indexOf(value);

  return (
    <div className={`level-grid${size === "sm" ? " level-grid-sm" : ""}`}>
      {JLPT_LEVELS.map((level, idx) => {
        const state = idx === maxIdx ? "selected" : idx < maxIdx ? "included" : "";
        return (
          <button
            key={level}
            type="button"
            className={["level-pill", state].filter(Boolean).join(" ")}
            onClick={() => onChange(level)}
          >
            <span className="check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="lvl">{level}</span>
            {size === "md" && <span className="desc">{DESCRIPTIONS[level]}</span>}
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

/** The most advanced level present in an enabled_levels array (defaults to N5). */
export function mostAdvancedLevel(levels: JlptLevel[]): JlptLevel {
  let best = 0;
  for (const level of levels) {
    const idx = JLPT_LEVELS.indexOf(level);
    if (idx > best) best = idx;
  }
  return JLPT_LEVELS[best];
}

// Shared color system for study cards. "gold" is used only for intro-card
// labels (new kanji / new word); review cards and their rating buttons use
// the three ReviewAccent hues.
export type ReviewAccent = "violet" | "blue" | "orange";
export type CardAccent = ReviewAccent | "gold";

export const ACCENT_TEXT_CLASSES: Record<CardAccent, string> = {
  violet: "text-accent-violet",
  blue: "text-accent-blue",
  orange: "text-accent-orange",
  gold: "text-accent-gold",
};

export const ACCENT_FOCUS_BORDER_CLASSES: Record<ReviewAccent, string> = {
  violet: "focus:border-accent-violet/40",
  blue: "focus:border-accent-blue/40",
  orange: "focus:border-accent-orange/40",
};

// Hard/Good/Easy share the card's accent hue but escalate from outline → light
// fill → solid fill, so the three ratings stay readable at a glance without
// breaking from the card's color theme.
export const ACCENT_RATING_TIERS: Record<ReviewAccent, { hard: string; good: string; easy: string }> = {
  violet: {
    hard: "border-accent-violet/35 bg-transparent text-accent-violet enabled:hover:bg-accent-violet/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(167,139,250,0.15)]",
    good: "border-accent-violet/45 bg-accent-violet/6 text-accent-violet enabled:hover:shadow-[0_6px_20px_rgba(167,139,250,0.20)]",
    easy: "border-accent-violet/90 bg-accent-violet/20 text-accent-violet enabled:hover:shadow-[0_0_26px_rgba(167,139,250,0.25)]",
  },
  blue: {
    hard: "border-accent-blue/35 bg-transparent text-accent-blue enabled:hover:bg-accent-blue/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.15)]",
    good: "border-accent-blue/45 bg-accent-blue/6 text-accent-blue enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.20)]",
    easy: "border-accent-blue/90 bg-accent-blue/20 text-accent-blue enabled:hover:shadow-[0_0_26px_rgba(0,210,255,0.25)]",
  },
  orange: {
    hard: "border-accent-orange/35 bg-transparent text-accent-orange enabled:hover:bg-accent-orange/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(251,146,60,0.15)]",
    good: "border-accent-orange/45 bg-accent-orange/6 text-accent-orange enabled:hover:shadow-[0_6px_20px_rgba(251,146,60,0.20)]",
    easy: "border-accent-orange/90 bg-accent-orange/20 text-accent-orange enabled:hover:shadow-[0_0_26px_rgba(251,146,60,0.25)]",
  },
};

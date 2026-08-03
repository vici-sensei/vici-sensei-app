import type { Rating, RatingPreviews } from "@/lib/types";

type CardAccent = "violet" | "blue" | "orange";

interface RatingGridProps {
  visible: boolean;
  disabled?: boolean;
  hideAgain?: boolean;
  accent: CardAccent;
  previews: RatingPreviews;
  onRate: (rating: Rating) => void;
}

const AGAIN_CLASSNAME =
  "border-accent-red/35 bg-transparent text-[#ff8a93] enabled:hover:bg-accent-red/[0.08] enabled:hover:shadow-[0_6px_20px_rgba(255,74,90,0.25)]";

/**
 * Hard/Good/Easy share the card's accent hue but escalate from outline → light
 * fill → solid fill, so the three ratings stay readable at a glance without
 * breaking from the card's color theme.
 */
const ACCENT_TIERS: Record<CardAccent, { hard: string; good: string; easy: string }> = {
  violet: {
    hard: "border-accent-violet/35 bg-transparent text-accent-violet enabled:hover:bg-accent-violet/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(167,139,250,0.15)]",
    good: "border-accent-violet/45 bg-accent-violet/6 text-accent-violet enabled:hover:shadow-[0_6px_20px_rgba(167,139,250,0.22)]",
    easy: "border-accent-violet/90 bg-accent-violet/20 text-accent-violet enabled:hover:shadow-[0_0_26px_rgba(167,139,250,0.55)]",
  },
  blue: {
    hard: "border-accent-blue/35 bg-transparent text-accent-blue enabled:hover:bg-accent-blue/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.15)]",
    good: "border-accent-blue/45 bg-accent-blue/6 text-accent-blue enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.22)]",
    easy: "border-accent-blue/90 bg-accent-blue/20 text-accent-blue enabled:hover:shadow-[0_0_26px_rgba(0,210,255,0.55)]",
  },
  orange: {
    hard: "border-accent-orange/35 bg-transparent text-accent-orange enabled:hover:bg-accent-orange/[0.06] enabled:hover:shadow-[0_6px_20px_rgba(251,146,60,0.15)]",
    good: "border-accent-orange/45 bg-accent-orange/6 text-accent-orange enabled:hover:shadow-[0_6px_20px_rgba(251,146,60,0.22)]",
    easy: "border-accent-orange/90 bg-accent-orange/20 text-accent-orange enabled:hover:shadow-[0_0_26px_rgba(251,146,60,0.55)]",
  },
};

function buildRatings(accent: CardAccent): { rating: Rating; label: string; previewKey: keyof RatingPreviews; className: string }[] {
  const tiers = ACCENT_TIERS[accent];
  return [
    { rating: 0, label: "Again", previewKey: "again", className: AGAIN_CLASSNAME },
    { rating: 1, label: "Hard", previewKey: "hard", className: tiers.hard },
    { rating: 2, label: "Good", previewKey: "good", className: tiers.good },
    { rating: 3, label: "Easy", previewKey: "easy", className: tiers.easy },
  ];
}

export function RatingGrid({ visible, disabled, hideAgain, accent, previews, onRate }: RatingGridProps) {
  const allRatings = buildRatings(accent);
  const ratings = hideAgain ? allRatings.filter((r) => r.rating !== 0) : allRatings;
  return (
    <div className={`mt-8.5 ${hideAgain ? "grid-cols-3" : "grid-cols-4"} gap-2.5 ${visible ? "grid" : "hidden"}`}>
      {ratings.map((r) => (
        <button
          key={r.rating}
          type="button"
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-1.5 py-[13px] font-sans text-[0.85rem] font-extrabold transition-[transform,box-shadow,background-color] duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${r.className}`}
          disabled={disabled}
          onClick={() => onRate(r.rating)}
        >
          {r.label}
          <span className="text-[0.68rem] font-bold opacity-75">{previews[r.previewKey]}</span>
        </button>
      ))}
    </div>
  );
}

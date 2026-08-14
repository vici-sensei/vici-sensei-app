import type { Rating, RatingPreviews } from "@/lib/types";
import { ACCENT_RATING_TIERS, type ReviewAccent } from "@/lib/study/accent";

interface RatingGridProps {
  visible: boolean;
  disabled?: boolean;
  hideAgain?: boolean;
  accent: ReviewAccent;
  previews: RatingPreviews;
  onRate: (rating: Rating) => void;
}

const AGAIN_CLASSNAME =
  "border-accent-red/35 bg-transparent text-[#ff8a93] enabled:hover:bg-accent-red/[0.08] enabled:hover:shadow-[0_6px_20px_rgba(255,74,90,0.25)]";

function buildRatings(accent: ReviewAccent): { rating: Rating; label: string; previewKey: keyof RatingPreviews; className: string }[] {
  const tiers = ACCENT_RATING_TIERS[accent];
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

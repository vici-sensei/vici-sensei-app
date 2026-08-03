import type { Rating, RatingPreviews } from "@/lib/types";

interface RatingGridProps {
  visible: boolean;
  disabled?: boolean;
  hideAgain?: boolean;
  previews: RatingPreviews;
  onRate: (rating: Rating) => void;
}

const RATINGS: { rating: Rating; label: string; previewKey: keyof RatingPreviews; className: string }[] = [
  { rating: 0, label: "Again", previewKey: "again", className: "border-accent-red/35 bg-accent-red/[0.08] text-[#ff8a93] enabled:hover:shadow-[0_6px_20px_rgba(255,74,90,0.25)]" },
  { rating: 1, label: "Hard", previewKey: "hard", className: "border-[rgba(255,165,61,0.35)] bg-[rgba(255,165,61,0.08)] text-[#ffb35e] enabled:hover:shadow-[0_6px_20px_rgba(255,165,61,0.25)]" },
  { rating: 2, label: "Good", previewKey: "good", className: "border-accent-blue/35 bg-accent-blue/[0.08] text-accent-blue enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.25)]" },
  { rating: 3, label: "Easy", previewKey: "easy", className: "border-accent-gold/35 bg-accent-gold/[0.08] text-accent-gold enabled:hover:shadow-[0_6px_20px_rgba(255,210,0,0.25)]" },
];

export function RatingGrid({ visible, disabled, hideAgain, previews, onRate }: RatingGridProps) {
  const ratings = hideAgain ? RATINGS.filter((r) => r.rating !== 0) : RATINGS;
  return (
    <div className={`mt-8.5 ${hideAgain ? "grid-cols-3" : "grid-cols-4"} gap-2.5 ${visible ? "grid" : "hidden"}`}>
      {ratings.map((r) => (
        <button
          key={r.rating}
          type="button"
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-transparent px-1.5 py-[13px] font-sans text-[0.85rem] font-extrabold text-white transition-[transform,box-shadow] duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${r.className}`}
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

import type { Rating } from "@/lib/types";

interface RatingGridProps {
  visible: boolean;
  disabled?: boolean;
  onRate: (rating: Rating) => void;
}

const RATINGS: { rating: Rating; label: string; hint: string; className: string }[] = [
  { rating: 0, label: "Again", hint: "<1m", className: "rating-again" },
  { rating: 1, label: "Hard", hint: "<10m", className: "rating-hard" },
  { rating: 2, label: "Good", hint: "1d", className: "rating-good" },
  { rating: 3, label: "Easy", hint: "6d", className: "rating-easy" },
];

export function RatingGrid({ visible, disabled, onRate }: RatingGridProps) {
  return (
    <div className={`rating-grid${visible ? " show" : ""}`}>
      {RATINGS.map((r) => (
        <button
          key={r.rating}
          type="button"
          className={`rating-btn ${r.className}`}
          disabled={disabled}
          onClick={() => onRate(r.rating)}
        >
          {r.label}
          <span className="rk">{r.hint}</span>
        </button>
      ))}
    </div>
  );
}

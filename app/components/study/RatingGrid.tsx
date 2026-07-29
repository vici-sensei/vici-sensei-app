import type { Rating } from "@/lib/types";

interface RatingGridProps {
  visible: boolean;
  disabled?: boolean;
  onRate: (rating: Rating) => void;
}

const RATINGS: { rating: Rating; label: string; hint: string; className: string }[] = [
  { rating: 0, label: "Again", hint: "<1m", className: "border-accent-red/35 bg-accent-red/[0.08] text-[#ff8a93] enabled:hover:shadow-[0_6px_20px_rgba(255,74,90,0.25)]" },
  { rating: 1, label: "Hard", hint: "<10m", className: "border-[rgba(255,165,61,0.35)] bg-[rgba(255,165,61,0.08)] text-[#ffb35e] enabled:hover:shadow-[0_6px_20px_rgba(255,165,61,0.25)]" },
  { rating: 2, label: "Good", hint: "1d", className: "border-accent-blue/35 bg-accent-blue/[0.08] text-accent-blue enabled:hover:shadow-[0_6px_20px_rgba(0,210,255,0.25)]" },
  { rating: 3, label: "Easy", hint: "6d", className: "border-accent-gold/35 bg-accent-gold/[0.08] text-accent-gold enabled:hover:shadow-[0_6px_20px_rgba(255,210,0,0.25)]" },
];

export function RatingGrid({ visible, disabled, onRate }: RatingGridProps) {
  return (
    <div className={`mt-8.5 grid-cols-4 gap-2.5 ${visible ? "grid" : "hidden"}`}>
      {RATINGS.map((r) => (
        <button
          key={r.rating}
          type="button"
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-transparent px-1.5 py-[13px] font-sans text-[0.85rem] font-extrabold text-white transition-[transform,box-shadow] duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${r.className}`}
          disabled={disabled}
          onClick={() => onRate(r.rating)}
        >
          {r.label}
          <span className="text-[0.68rem] font-bold opacity-75">{r.hint}</span>
        </button>
      ))}
    </div>
  );
}

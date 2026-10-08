import type { ReactNode } from "react";

// `lg` is the session summary's tiles (four across on a wide page), `sm` the practice results'.
const SIZES = {
  lg: { value: "text-[1.7rem]", label: "text-[0.78rem]" },
  sm: { value: "text-xl", label: "text-sm" },
} as const;

// `muted` is a value that isn't a real result yet (e.g. "N/A"), so it drops to a lighter weight too.
const TONES = {
  default: "font-extrabold",
  blue: "font-extrabold text-accent-blue",
  gold: "font-extrabold text-accent-gold",
  muted: "font-semibold text-text-muted",
} as const;

/** One result tile on a summary screen: a big value over a small label. */
export function StatBox({
  value,
  label,
  size = "sm",
  tone = "default",
}: {
  value: ReactNode;
  label: string;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
      <div className={`mb-1 ${SIZES[size].value} ${TONES[tone]}`}>{value}</div>
      <div className={`${SIZES[size].label} font-semibold text-text-muted`}>{label}</div>
    </div>
  );
}

const LEVEL_COLOR_CLASSES: Record<string, string> = {
  N5: "border-green-400/30 bg-green-400/10 text-green-400",
  N4: "border-blue-400/30 bg-blue-400/10 text-blue-400",
  N3: "border-orange-400/30 bg-orange-400/10 text-orange-400",
  N2: "border-accent-red/30 bg-accent-red/10 text-accent-red",
  N1: "border-pink-400/30 bg-pink-400/10 text-pink-400",
};

const FALLBACK_COLOR_CLASSES = "border-border-soft bg-white/5 text-text-muted";

function levelColorClasses(level: string | null | undefined): string {
  if (!level) return FALLBACK_COLOR_CLASSES;
  return LEVEL_COLOR_CLASSES[level] ?? FALLBACK_COLOR_CLASSES;
}

type LevelBadgeSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<LevelBadgeSize, string> = {
  sm: "rounded-md px-1.5 py-0.5 text-[0.65rem]",
  md: "rounded-lg px-2.5 py-1 text-[0.78rem]",
  lg: "rounded-xl px-2 md:px-4 md:py-1.5 text-[1.05rem]",
};

interface LevelBadgeProps {
  level: string | null | undefined;
  size?: LevelBadgeSize;
  className?: string;
}

export function LevelBadge({ level, size = "md", className }: LevelBadgeProps) {
  const classes = [
    "inline-flex items-center justify-center border font-extrabold md:tracking-[0.5px]",
    SIZE_CLASSES[size],
    levelColorClasses(level),
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{level ?? "—"}</span>;
}

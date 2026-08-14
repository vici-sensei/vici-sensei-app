import type { ReactNode } from "react";
import { ACCENT_TEXT_CLASSES, type CardAccent } from "@/lib/study/accent";

const SIZE_CLASSES = {
  sm: "max-w-[560px]",
  lg: "max-w-[620px]",
} as const;

interface Props {
  label: string;
  accent: CardAccent;
  size?: keyof typeof SIZE_CLASSES;
  cornerBadge?: ReactNode;
  /** "column" turns direct children into a flex column so one of them (given
   * min-height + overflow-y-auto) can shrink to fit while the rest stay full size --
   * used by cards with an unbounded-length section (e.g. the new-kanji word list). */
  layout?: "flow" | "column";
  children: ReactNode;
}

/** Shared outer shell (border, background, sizing) + label for every card shown on /study. */
export function StudyCardShell({ label, accent, size = "sm", cornerBadge, layout = "flow", children }: Props) {
  return (
    <div
      className={`relative w-full ${SIZE_CLASSES[size]} max-h-full overflow-y-auto rounded-3xl border border-border-soft bg-bg-cards px-4 py-4 text-center backdrop-blur-[10px] ${
        layout === "column" ? "flex flex-col" : ""
      }`}
    >
      {cornerBadge}
      <div className={`mb-6 shrink-0 text-xs font-extrabold uppercase tracking-[1.5px] ${ACCENT_TEXT_CLASSES[accent]}`}>
        {label}
      </div>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { ACCENT_TEXT_CLASSES, type CardAccent } from "@/lib/study/accent";

/** Inline accent-colored, bold text — e.g. the highlighted word in a card's subtitle. */
export function Accent({ accent, children }: { accent: CardAccent; children: ReactNode }) {
  return <span className={`font-extrabold ${ACCENT_TEXT_CLASSES[accent]}`}>{children}</span>;
}

import type { ReactNode } from "react";

/** Heading for a block on a dictionary detail page ("Example words", "Your progress"). */
export function BrowseSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">{children}</div>
  );
}

/** One labelled fact in a detail page's header row (reading, JLPT level, part of speech...). The
 * value is passed as children so each page keeps its own sizing, and the loading placeholders reuse
 * the real label with a skeleton in place of the value. */
export function BrowseFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted">{label}</div>
      {children}
    </div>
  );
}

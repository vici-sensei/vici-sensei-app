import type { ReactNode } from "react";

/** Small bordered pill used for readings/parts-of-speech on intro cards. */
export function InfoChip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { FaXmark } from "react-icons/fa6";

/** Replaces the shared shell Header on the reading test pages -- these are meant to be a
 * focused, distraction-free flow, so the only way out is this single "x" back to the dashboard
 * (mirrors the exit button QueueProgressBar uses for the swipe-card session). */
export function ReadingTestCloseHeader() {
  return (
    <div className="sticky top-0 z-50 flex h-17 items-center border-b border-border-soft bg-bg-main/85 px-7 backdrop-blur-[12px]">
      <Link
        href="/dashboard"
        aria-label="Exit reading test"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
      >
        <FaXmark />
      </Link>
    </div>
  );
}

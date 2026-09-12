"use client";

import Link from "next/link";
import { FaXmark } from "react-icons/fa6";

/** Exit control for the reading test flow -- inline content, not a header bar, so these pages
 * stay chrome-less (mirrors the exit button QueueProgressBar uses for the swipe-card session).
 * The only way out of the test is this single "x" back to the dashboard. */
export function ReadingTestCloseButton() {
  return (
    <Link
      href="/dashboard"
      aria-label="Exit reading test"
      className="flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-full bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
    >
      <FaXmark />
    </Link>
  );
}

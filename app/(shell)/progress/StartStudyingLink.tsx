"use client";

import Link from "next/link";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { buttonClasses } from "@/app/components/ui/Button";

/** Same live studyDisabled as the nav's Study link — see StudyStatsProvider in the shell layout. */
export function StartStudyingLink() {
  const { studyDisabled } = useStudyStats();

  if (studyDisabled) {
    return (
      <span
        aria-disabled="true"
        className={buttonClasses({ hover: "hover", className: "mt-2.5 cursor-not-allowed opacity-45" })}
      >
        Start studying
      </span>
    );
  }

  return (
    <Link href="/study" className={buttonClasses({ hover: "hover", className: "mt-2.5" })}>
      Start studying
    </Link>
  );
}

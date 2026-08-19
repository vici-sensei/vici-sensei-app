"use client";

import Link from "next/link";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { prefetchFirstDueCard } from "@/lib/client-data/study";
import { buttonClasses } from "@/app/components/ui/Button";

/** Same live studyDisabled as the nav's Study link — see StudyStatsProvider in the shell layout. */
export function StartStudyingLink() {
  const { studyDisabled } = useStudyStats();
  const { user } = useAuth();

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

  function handleIntent() {
    if (user) prefetchFirstDueCard(user.id);
  }

  return (
    <Link
      href="/study"
      onMouseEnter={handleIntent}
      onFocus={handleIntent}
      className={buttonClasses({ hover: "hover", className: "mt-2.5" })}
    >
      Start studying
    </Link>
  );
}

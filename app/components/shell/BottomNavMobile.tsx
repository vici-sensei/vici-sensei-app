"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { NAV_ITEMS } from "./navItems";

export function BottomNavMobile() {
  const pathname = usePathname();
  const { studyDisabled } = useStudyStats();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-60 flex justify-around border-t border-border-soft bg-bg-main/92 px-1.5 pb-3.5 pt-2.5 backdrop-blur-[12px] md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        const disabled = studyDisabled && item.href === "/study";
        if (disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className="flex flex-1 cursor-not-allowed flex-col items-center gap-[3px] text-[0.68rem] font-extrabold text-text-muted opacity-45 [&>svg]:h-5 [&>svg]:w-5"
            >
              {item.icon}
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-[3px] text-[0.68rem] font-extrabold [&>svg]:h-5 [&>svg]:w-5 ${
              active ? "text-accent-red" : "text-text-muted"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

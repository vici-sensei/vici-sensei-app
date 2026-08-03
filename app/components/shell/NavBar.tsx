"use client";

import { usePathname } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { NAV_ITEMS } from "./navItems";
import { NavItem } from "./NavItem";
import { navBarClasses } from "./navBarClasses";

export function NavBar() {
  const pathname = usePathname();
  const { studyDisabled } = useStudyStats();

  return (
    <nav className={navBarClasses}>
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          active={item.isActive(pathname)}
          disabled={studyDisabled && item.href === "/study"}
        />
      ))}
    </nav>
  );
}

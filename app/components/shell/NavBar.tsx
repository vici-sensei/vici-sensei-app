"use client";

import { usePathname } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { NAV_ITEMS } from "./navItems";
import { NavItem } from "./NavItem";
import { navBarClasses } from "./navBarClasses";

export function NavBar() {
  const pathname = usePathname();
  const { studyDisabled } = useStudyStats();
  const keyboardOpen = useKeyboardOpen();
  useViewportHeight();

  return (
    <nav data-shell-navbar className={navBarClasses} style={keyboardOpen ? { display: "none" } : undefined}>
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

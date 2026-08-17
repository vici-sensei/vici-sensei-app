"use client";

import { usePathname } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { NAV_ITEMS } from "./navItems";
import { NavItem } from "./NavItem";
import { MobileNavMenu } from "./MobileNavMenu";
import { navBarClasses } from "./navBarClasses";

export function NavBar() {
  const pathname = usePathname();
  const { studyDisabled } = useStudyStats();

  const items = NAV_ITEMS.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.isActive(pathname),
    disabled: studyDisabled && item.href === "/study",
    danger: item.danger,
  }));

  return (
    <>
      <nav data-shell-navbar className={navBarClasses}>
        {items.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
      <MobileNavMenu items={items} />
    </>
  );
}

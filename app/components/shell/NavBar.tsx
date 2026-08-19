"use client";

import { usePathname } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { prefetchFirstDueCard } from "@/lib/client-data/study";
import { prefetchProgressSummary } from "@/lib/client-data/progress";
import { prefetchLeaderboard } from "@/lib/client-data/leaderboard";
import { prefetchKanjiList } from "@/lib/client-data/kanji";
import { NAV_ITEMS } from "./navItems";
import { NavItem } from "./NavItem";
import { MobileNavMenu } from "./MobileNavMenu";
import { navBarClasses } from "./navBarClasses";

function intentFor(href: string, userId: string | undefined): (() => void) | undefined {
  switch (href) {
    case "/study":
      return userId ? () => prefetchFirstDueCard(userId) : undefined;
    case "/progress":
      return userId ? () => prefetchProgressSummary(userId) : undefined;
    case "/leaderboard":
      return userId ? () => prefetchLeaderboard(userId) : undefined;
    case "/browse/kanji":
      return () => prefetchKanjiList();
    default:
      return undefined;
  }
}

export function NavBar() {
  const pathname = usePathname();
  const { studyDisabled } = useStudyStats();
  const { user } = useAuth();

  const items = NAV_ITEMS.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.isActive(pathname),
    disabled: studyDisabled && item.href === "/study",
    danger: item.danger,
    subItems: item.subItems?.map((sub) => ({
      href: sub.href,
      label: sub.label,
      icon: sub.icon,
      active: sub.isActive(pathname),
    })),
    onIntent: intentFor(item.href, user?.id),
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

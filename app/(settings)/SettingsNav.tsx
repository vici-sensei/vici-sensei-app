"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FaBook, FaUser, FaCreditCard, FaTriangleExclamation } from "react-icons/fa6";

interface Item {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: ReactNode;
  danger?: boolean;
}

const ITEMS: Item[] = [
  {
    href: "/settings/study",
    label: "Settings",
    icon: <FaBook />,
  },
  {
    href: "/settings/profile",
    label: "Profile",
    icon: <FaUser />,
  },
  {
    href: "/settings/billing",
    label: "Subscription",
    mobileLabel: "Plan",
    icon: <FaCreditCard />,
  },
  {
    href: "/settings/account",
    label: "Account",
    danger: true,
    icon: <FaTriangleExclamation />,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    // Mobile: fixed to the bottom of the screen, same treatment as BottomNavMobile
    // (so it stays reachable while scrolling a long settings page instead of scrolling away).
    // Desktop: reverts to the original static sidebar.
    <nav className="fixed inset-x-0 bottom-0 z-60 flex flex-row justify-around gap-0.5 border-t border-border-soft bg-bg-main/92 px-1.5 pb-3.5 pt-2.5 backdrop-blur-[12px] md:static md:w-55 md:shrink-0 md:flex-col md:justify-start md:border-t-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-none">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const classes = [
          // Mobile: stacked icon-over-label tabs, evenly split — same pattern as BottomNavMobile.
          "flex flex-1 cursor-pointer flex-col items-center gap-[3px] text-[0.68rem] font-extrabold transition-all [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
          // Desktop: original side-by-side sidebar item with a left border indicator.
          "md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:border-l-[3px] md:px-3.5 md:py-[11px] md:text-[0.92rem]",
          active
            ? item.danger
              ? "text-[#ff8a93] md:border-accent-red md:bg-accent-red/10"
              : "text-accent-red md:border-accent-red md:bg-accent-red/[0.08] md:text-white"
            : "text-text-muted hover:text-white md:border-transparent",
        ].join(" ");
        return (
          <Link key={item.href} href={item.href} className={classes}>
            {item.icon}
            <span className="md:hidden">{item.mobileLabel ?? item.label}</span>
            <span className="hidden md:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

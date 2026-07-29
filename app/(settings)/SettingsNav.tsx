"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
}

const ITEMS: Item[] = [
  {
    href: "/settings/study",
    label: "Study",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/settings/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "/settings/billing",
    label: "Billing",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    href: "/settings/account",
    label: "Account",
    danger: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-full shrink-0 flex-row gap-0.5 overflow-x-auto md:w-55 md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const classes = [
          "flex cursor-pointer items-center gap-3 rounded-lg border-l-[3px] px-3.5 py-[11px] text-[0.92rem] font-bold transition-all [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
          active
            ? item.danger
              ? "border-accent-red bg-accent-red/10 text-[#ff8a93]"
              : "border-accent-red bg-accent-red/[0.08] text-white"
            : "border-transparent text-text-muted hover:text-white",
        ].join(" ");
        return (
          <Link key={item.href} href={item.href} className={classes}>
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FaBook, FaUser, FaCreditCard, FaTriangleExclamation } from "react-icons/fa6";

interface Item {
  href: string;
  label: string;
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

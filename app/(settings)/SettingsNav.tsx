"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FaBook, FaUser, FaCreditCard, FaTriangleExclamation } from "react-icons/fa6";
import { NavItem } from "@/app/components/shell/NavItem";
import { navBarClasses } from "@/app/components/shell/navBarClasses";
import { useViewportHeight } from "@/lib/useViewportHeight";

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
  useViewportHeight();

  return (
    <nav className={navBarClasses}>
      {ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          mobileLabel={item.mobileLabel}
          active={pathname === item.href}
          danger={item.danger}
        />
      ))}
    </nav>
  );
}

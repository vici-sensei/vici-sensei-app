"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Desktop sidebar only -- the mobile equivalent is the full-screen menu (see MobileNavMenu).
const sharedClasses =
  "flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-4 py-3 text-[0.95rem] font-semibold transition-all [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0";

const activeClasses = "border-accent-red bg-accent-red/10 text-white";
const activeDangerClasses = "border-accent-red bg-accent-red/10 text-[#ff8a93]";
const inactiveClasses = "text-text-muted hover:text-white";
const disabledClasses = "text-text-muted opacity-45 cursor-not-allowed";

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export function NavItem({ href, icon, label, active, disabled, danger }: NavItemProps) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${sharedClasses} ${disabledClasses}`}>
        {icon}
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      className={`${sharedClasses} cursor-pointer ${active ? (danger ? activeDangerClasses : activeClasses) : inactiveClasses}`}
    >
      {icon}
      {label}
    </Link>
  );
}

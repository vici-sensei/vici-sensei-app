"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const sharedClasses =
  "flex flex-1 flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[0.7rem] font-semibold transition-all md:w-full md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-xl md:border-l-[3px] md:border-transparent md:px-4 md:py-3 md:text-[0.95rem] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0";

const activeClasses = "text-accent-red md:border-accent-red md:bg-accent-red/10 md:text-white";
const activeDangerClasses = "text-[#ff8a93] md:border-accent-red md:bg-accent-red/10 md:text-[#ff8a93]";
const inactiveClasses = "text-text-muted md:hover:text-white";
const disabledClasses = "text-text-muted opacity-45 cursor-not-allowed";

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  mobileLabel?: ReactNode;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export function NavItem({ href, icon, label, mobileLabel, active, disabled, danger }: NavItemProps) {
  const labelNode = mobileLabel ? (
    <>
      <span className="md:hidden">{mobileLabel}</span>
      <span className="hidden md:inline">{label}</span>
    </>
  ) : (
    label
  );

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${sharedClasses} ${disabledClasses}`}>
        {icon}
        {labelNode}
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
      {labelNode}
    </Link>
  );
}

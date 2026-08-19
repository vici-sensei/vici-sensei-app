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

// Sub-items are always rendered alongside their parent (no expand/collapse state) --
// the current route only decides which one, if any, shows as active.
// Active state reads as a small dot in the indent gutter rather than the parent's left border --
// keeps the sub-list visually lighter than the top-level items.
const subSharedClasses =
  "relative flex items-center gap-2.5 rounded-lg px-2.5 py-[0.44rem] text-[0.76rem] font-semibold transition-all [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0";
const subActiveClasses =
  "text-white before:absolute before:-left-[1.2rem] before:top-1/2 before:h-[5px] before:w-[5px] before:-translate-y-1/2 before:rounded-full before:bg-accent-red before:content-['']";
const subInactiveClasses = "text-[#6b7280] hover:text-text-muted";

export interface SubNavItemProps {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  active: boolean;
}

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
  subItems?: SubNavItemProps[];
  /** Hover/focus intent signal -- e.g. the Study link uses this to prefetch the first due
   * card well before the user actually clicks through to /study. */
  onIntent?: () => void;
}

export function NavItem({ href, icon, label, active, disabled, danger, subItems, onIntent }: NavItemProps) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${sharedClasses} ${disabledClasses}`}>
        {icon}
        {label}
      </span>
    );
  }

  return (
    <div>
      <Link
        href={href}
        onMouseEnter={onIntent}
        onFocus={onIntent}
        className={`${sharedClasses} cursor-pointer ${active ? (danger ? activeDangerClasses : activeClasses) : inactiveClasses}`}
      >
        {icon}
        {label}
      </Link>
      {subItems && subItems.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 pl-7">
          {subItems.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              className={`${subSharedClasses} cursor-pointer ${sub.active ? subActiveClasses : subInactiveClasses}`}
            >
              {sub.icon}
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

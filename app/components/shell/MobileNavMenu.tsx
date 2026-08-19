"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMobileMenu } from "./MobileMenuContext";

export interface MobileNavSubItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}

export interface MobileNavMenuItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
  subItems?: MobileNavSubItem[];
}

// Same treatment as the desktop sidebar (see NavItem.tsx): sub-items are always shown alongside
// their parent, and the active one reads as a dot in the indent gutter rather than a filled row.
const subRowClasses =
  "relative flex items-center gap-3 rounded-lg pl-5 text-[0.92rem] font-semibold transition-colors [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0";
const subActiveClasses =
  "text-white before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-accent-red before:content-['']";
const subInactiveClasses = "text-[#6b7280] hover:text-text-muted";

// A gentle deceleration curve (no overshoot) reads smoother than Tailwind's default ease-out.
const SMOOTH_EASE = "cubic-bezier(.16,1,.3,1)";

// Sits just below the header (top-17) so the close button in the header stays reachable
// and visible above the panel instead of the panel covering it. Stays mounted at all times
// (rather than display:none) so the open/close can transition both ways; `inert` + `aria-hidden`
// keep it out of the tab order and off-screen-reader while closed.
export function MobileNavMenu({ items }: { items: MobileNavMenuItem[] }) {
  const { open, close } = useMobileMenu();

  const backdropStyle: CSSProperties = {
    transformOrigin: "top",
    transform: open ? "scaleY(1)" : "scaleY(0)",
    transitionDuration: "420ms",
    transitionTimingFunction: SMOOTH_EASE,
  };

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={`fixed inset-x-0 top-17 bottom-0 z-45 overflow-y-auto md:hidden ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
    >
      {/* the background sheet drops down from the header edge, like a shade unrolling.
          Pinned via `fixed` (not `absolute`) so it stays viewport-sized instead of
          scrolling away with the nav content when the menu overflows a short screen. */}
      <div
        style={backdropStyle}
        className="fixed inset-x-0 top-17 bottom-0 -z-10 bg-bg-main transition-transform"
      />

      <nav className="flex flex-col gap-1.5 px-4 py-5">
        {items.map((item, index) => {
          const rowStyle: CSSProperties = {
            transitionDuration: "280ms",
            transitionTimingFunction: SMOOTH_EASE,
            transitionDelay: open ? `${120 + index * 40}ms` : "0ms",
          };
          const enterTransform = open ? "translate-y-0" : "-translate-y-1.5";
          const rowClasses = `flex w-full items-center justify-center gap-4 rounded-xl px-4 py-3.5 text-[1.05rem] font-semibold transition-[color,opacity,transform] [&>svg]:h-5.5 [&>svg]:w-5.5 [&>svg]:shrink-0 ${enterTransform}`;

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                style={rowStyle}
                className={`${rowClasses} text-text-muted ${open ? "opacity-45" : "opacity-0"}`}
              >
                {item.icon}
                {item.label}
              </span>
            );
          }

          return (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                onClick={close}
                style={rowStyle}
                className={`${rowClasses} ${open ? "opacity-100" : "opacity-0"} ${
                  item.active
                    ? item.danger
                      ? "bg-accent-red/10 text-[#ff8a93]"
                      : "bg-accent-red/10 text-white"
                    : "text-text-muted hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
              {item.subItems && item.subItems.length > 0 && (
                <div
                  style={rowStyle}
                  className={`grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-8 gap-y-4 pt-3 transition-[opacity,transform] ${enterTransform} ${open ? "opacity-100" : "opacity-0"}`}
                >
                  {item.subItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      prefetch={false}
                      onClick={close}
                      className={`${subRowClasses} ${sub.active ? subActiveClasses : subInactiveClasses}`}
                    >
                      {sub.icon}
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}

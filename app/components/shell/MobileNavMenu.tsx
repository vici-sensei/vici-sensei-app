"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useMobileMenu } from "./MobileMenuContext";

export interface MobileNavMenuItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
}

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
      {/* the background sheet drops down from the header edge, like a shade unrolling */}
      <div style={backdropStyle} className="absolute inset-0 -z-10 bg-bg-main transition-transform" />

      <nav className="flex flex-col items-center gap-1.5 px-4 py-5">
        {items.map((item, index) => {
          const rowStyle: CSSProperties = {
            transitionDuration: "280ms",
            transitionTimingFunction: SMOOTH_EASE,
            transitionDelay: open ? `${120 + index * 40}ms` : "0ms",
          };
          const enterTransform = open ? "translate-y-0" : "-translate-y-1.5";
          const rowClasses = `flex items-center gap-4 rounded-xl px-4 py-3.5 text-[1.05rem] font-semibold transition-[color,opacity,transform] [&>svg]:h-5.5 [&>svg]:w-5.5 [&>svg]:shrink-0 ${enterTransform}`;

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
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={close}
              style={rowStyle}
              className={`${rowClasses} border-l-[3px] ${open ? "opacity-100" : "opacity-0"} ${
                item.active
                  ? item.danger
                    ? "border-accent-red bg-accent-red/10 text-[#ff8a93]"
                    : "border-accent-red bg-accent-red/10 text-white"
                  : "border-transparent text-text-muted hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

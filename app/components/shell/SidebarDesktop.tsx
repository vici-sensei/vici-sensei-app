"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./navItems";

export function SidebarDesktop() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-55 shrink-0 flex-col gap-0.5 border-r border-border-soft px-3.5 py-6 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-l-[3px] px-3.5 py-[11px] text-[0.92rem] font-semibold transition-all [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 ${
              active
                ? "border-accent-red bg-accent-red/[0.08] text-white"
                : "border-transparent text-text-muted hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

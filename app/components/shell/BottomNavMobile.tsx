"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./navItems";

export function BottomNavMobile() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-60 flex justify-around border-t border-border-soft bg-bg-main/92 px-1.5 pb-3.5 pt-2.5 backdrop-blur-[12px] md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-[3px] text-[0.68rem] font-extrabold [&>svg]:h-5 [&>svg]:w-5 ${
              active ? "text-accent-red" : "text-text-muted"
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

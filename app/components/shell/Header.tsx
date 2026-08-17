"use client";

import Link from "next/link";
import { FaToriiGate } from "react-icons/fa6";
import type { UserProfile } from "@/lib/types";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { MenuIcon } from "./MenuIcon";
import { useMobileMenu } from "./MobileMenuContext";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ user }: { user: UserProfile }) {
  const keyboardOpen = useKeyboardOpen();
  const { open, toggle } = useMobileMenu();

  return (
    <header
      className="sticky top-0 z-50 grid h-17 grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 border-b border-border-soft bg-bg-main/85 px-7 backdrop-blur-[12px]"
      style={keyboardOpen ? { display: "none" } : undefined}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="col-start-1 inline-flex h-9 w-9 items-center justify-center md:hidden"
      >
        <MenuIcon open={open} />
      </button>
      <Link
        href="/dashboard"
        prefetch={false}
        className="col-start-2 flex items-center justify-self-center gap-2 text-[1.15rem] font-extrabold tracking-[-0.4px]"
      >
        <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center border-[1.3px] border-accent-red">
          <span className="pointer-events-none absolute inset-[2px] border border-accent-red/50" />
          <FaToriiGate className="relative h-4 w-4 text-accent-red" />
        </span>
        Vici Sensei
      </Link>
      <div className="col-start-3 justify-self-end">
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}

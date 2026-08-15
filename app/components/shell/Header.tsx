"use client";

import Link from "next/link";
import { FaArrowLeft, FaToriiGate } from "react-icons/fa6";
import type { UserProfile } from "@/lib/types";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ user, showBack = false }: { user: UserProfile; showBack?: boolean }) {
  const keyboardOpen = useKeyboardOpen();

  return (
    <header
      className="sticky top-0 z-50 relative flex h-17 items-center justify-between border-b border-border-soft bg-bg-main/85 px-7 backdrop-blur-[12px]"
      style={keyboardOpen ? { display: "none" } : undefined}
    >
      <Link
        href="/dashboard"
        aria-hidden={!showBack}
        tabIndex={showBack ? undefined : -1}
        prefetch={false}
        className={`inline-flex items-center gap-2 text-[0.88rem] font-bold text-text-muted hover:text-white [&>svg]:h-3.75 [&>svg]:w-3.75 ${showBack ? "" : "invisible pointer-events-none"}`}
      >
        <FaArrowLeft />
      </Link>
      <Link
        href="/dashboard"
        prefetch={false}
        className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[1.15rem] font-extrabold tracking-[-0.4px]"
      >
        <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center border-[1.3px] border-accent-red">
          <span className="pointer-events-none absolute inset-[2px] border border-accent-red/50" />
          <FaToriiGate className="relative h-4 w-4 text-accent-red" />
        </span>
        Vici Sensei
      </Link>
      <ProfileMenu user={user} />
    </header>
  );
}

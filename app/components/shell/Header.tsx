import Link from "next/link";
import { FaArrowLeft, FaToriiGate } from "react-icons/fa6";
import type { UserProfile } from "@/lib/types";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ user, showBack = false }: { user: UserProfile; showBack?: boolean }) {
  return (
    <header className="sticky top-0 z-50 relative flex h-17 items-center justify-between border-b border-border-soft bg-bg-main/85 px-7 backdrop-blur-[12px]">
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
        <FaToriiGate className="h-5 w-5 text-accent-red" />
        Vici Sensei
      </Link>
      <ProfileMenu user={user} />
    </header>
  );
}

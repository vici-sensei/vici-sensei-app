import Link from "next/link";
import { FaToriiGate } from "react-icons/fa6";
import type { UserProfile } from "@/lib/types";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ user }: { user: UserProfile }) {
  return (
    <header className="sticky top-0 z-50 flex h-17 items-center justify-between border-b border-border-soft bg-bg-main/85 px-7 backdrop-blur-[12px]">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-[1.15rem] font-extrabold tracking-[-0.4px]">
        <FaToriiGate className="h-5 w-5 text-accent-red" />
        Vici Sensei
      </Link>
      <ProfileMenu user={user} />
    </header>
  );
}

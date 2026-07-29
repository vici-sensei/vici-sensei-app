import Link from "next/link";
import type { UserProfile } from "@/lib/types";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ user }: { user: UserProfile }) {
  return (
    <header className="app-header">
      <Link href="/dashboard" className="app-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8h20M4 8v13M20 8v13M7 3c0 2.5 2 4 5 4s5-1.5 5-4" />
        </svg>
        Vici Sensei
      </Link>
      <ProfileMenu user={user} />
    </header>
  );
}

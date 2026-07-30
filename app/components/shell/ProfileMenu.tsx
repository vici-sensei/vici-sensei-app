"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import type { UserProfile } from "@/lib/types";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function ProfileMenu({ user }: { user: UserProfile }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiPost("/api/auth/logout");
    } catch {
      // even if the request fails, still send the user back to /login
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const menuItemClasses =
    "block w-full rounded-lg px-3 py-2.5 text-left text-[0.88rem] font-semibold text-text-muted hover:bg-white/5 hover:text-white";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 text-[0.9rem] font-extrabold text-white"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        {initials(user.display_name, user.email)}
      </button>
      <div
        className={`absolute right-0 top-12 z-60 w-55 flex-col gap-0.5 rounded-2xl border border-border-soft bg-bg-cards p-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)] backdrop-blur-[10px] ${
          open ? "flex" : "hidden"
        }`}
        role="menu"
      >
        <Link href="/settings/study" className={menuItemClasses} onClick={() => setOpen(false)}>
          Settings
        </Link>
        <Link href="/settings/profile" className={menuItemClasses} onClick={() => setOpen(false)}>
          Profile
        </Link>
        <Link href="/settings/billing" className={menuItemClasses} onClick={() => setOpen(false)}>
          Subscription
        </Link>
        <Link href="/settings/account" className={menuItemClasses} onClick={() => setOpen(false)}>
          Account
        </Link>
        <hr className="mx-1 my-1.5 border-border-soft" />
        <button
          type="button"
          className={`${menuItemClasses} text-accent-red hover:text-accent-red`}
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}

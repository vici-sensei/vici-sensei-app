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

  return (
    <div className="app-avatar-wrap" ref={wrapRef}>
      <button
        type="button"
        className="app-avatar"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        {initials(user.display_name, user.email)}
      </button>
      <div className={`profile-menu${open ? " open" : ""}`} role="menu">
        <Link href="/settings/study" onClick={() => setOpen(false)}>
          Settings — Study
        </Link>
        <Link href="/settings/profile" onClick={() => setOpen(false)}>
          Settings — Profile
        </Link>
        <Link href="/settings/billing" onClick={() => setOpen(false)}>
          Settings — Billing
        </Link>
        <Link href="/settings/account" onClick={() => setOpen(false)}>
          Settings — Account
        </Link>
        <hr />
        <button type="button" className="logout" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}

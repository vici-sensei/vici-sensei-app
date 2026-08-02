"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import type { UserProfile } from "@/lib/types";
import { avatarSrc } from "@/lib/avatar";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function Avatar({
  user,
  avatarFailed,
  onAvatarError,
  className,
}: {
  user: UserProfile;
  avatarFailed: boolean;
  onAvatarError: () => void;
  className: string;
}) {
  const showAvatar = Boolean(user.avatar_url) && !avatarFailed;
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 font-extrabold text-white ${className}`}
    >
      {showAvatar ? (
        <Image
          src={avatarSrc(user.avatar_url as string, 128)}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
          onError={onAvatarError}
        />
      ) : (
        initials(user.display_name, user.email)
      )}
    </div>
  );
}

export function ProfileMenu({ user }: { user: UserProfile }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
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
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <Avatar
          user={user}
          avatarFailed={avatarFailed}
          onAvatarError={() => setAvatarFailed(true)}
          className="h-9 w-9 text-[0.9rem]"
        />
      </button>
      <div
        className={`absolute right-0 top-12 z-60 w-55 flex-col gap-0.5 rounded-2xl border border-border-soft bg-[#111827] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)] ${
          open ? "flex" : "hidden"
        }`}
        role="menu"
      >
        <div className="flex flex-col items-center gap-2 px-2 py-3 text-center">
          <Link href="/settings/profile" onClick={() => setOpen(false)}>
            <Avatar
              user={user}
              avatarFailed={avatarFailed}
              onAvatarError={() => setAvatarFailed(true)}
              className="h-16 w-16 shrink-0 text-[1.3rem]"
            />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-bold text-white">
              {user.display_name?.trim() || user.email}
            </p>
            {user.display_name?.trim() ? (
              <p className="truncate text-[0.76rem] font-medium text-text-muted">{user.email}</p>
            ) : null}
          </div>
        </div>
        <hr className="mx-1 mb-1.5 border-border-soft" />
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

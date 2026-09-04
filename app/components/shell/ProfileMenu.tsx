"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import { avatarSrc } from "@/lib/avatar";
import { ProBadge } from "@/app/components/ui/ProBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaUser, FaShieldHalved, FaRightFromBracket } from "react-icons/fa6";

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
    <div className={`relative ${className}`}>
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 font-extrabold text-white">
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
          <FaUser className="h-[45%] w-[45%]" />
        )}
      </div>
      {user.is_premium ? <ProBadge className="-top-2.5 -right-1.5" /> : null}
    </div>
  );
}

export function ProfileMenu({ user, loaded = true }: { user: UserProfile; loaded?: boolean }) {
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
      await createClient().auth.signOut();
    } catch {
      // even if the request fails, still send the user back to /login
    } finally {
      router.push("/login");
    }
  }

  const menuItemClasses =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[0.88rem] font-semibold text-text-muted hover:bg-white/5 hover:text-white [&>svg]:h-3.75 [&>svg]:w-3.75 [&>svg]:shrink-0";

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
            {loaded ? (
              <>
                <p className="break-words text-center text-[0.88rem] font-bold text-white">
                  {user.display_name?.trim() || user.email}
                </p>
                {user.display_name?.trim() ? (
                  <p className="truncate text-[0.76rem] font-medium text-text-muted">{user.email}</p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-0.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            )}
          </div>
        </div>
        <hr className="mx-1 mb-1.5 border-border-soft" />
        <Link href="/settings/profile" className={menuItemClasses} onClick={() => setOpen(false)}>
          <FaUser />
          Profile
        </Link>
        <Link href="/settings/account" className={menuItemClasses} onClick={() => setOpen(false)}>
          <FaShieldHalved />
          Account
        </Link>
        <hr className="mx-1 my-1.5 border-border-soft" />
        <button
          type="button"
          className={`${menuItemClasses} text-accent-red hover:text-accent-red`}
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <FaRightFromBracket />
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}

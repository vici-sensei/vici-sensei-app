"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FaClock } from "react-icons/fa6";
import { buttonClasses } from "@/app/components/ui/Button";

function formatDeletionDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function AccountDeletionContent() {
  const searchParams = useSearchParams();
  const formattedDate = formatDeletionDate(searchParams.get("until"));

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center">
      <div className="relative w-full max-w-[440px]">
        <div className="mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-blue/30 bg-accent-blue/10">
          <FaClock className="h-6.5 w-6.5 text-accent-blue" />
        </div>
        <h1 className="mb-2.5 text-2xl font-extrabold">Your account is on hold, not gone</h1>
        <p className="mb-2.5 text-base leading-[1.6] text-text-muted">
          We&apos;ve deactivated it instead of deleting it right away.
          {formattedDate ? (
            <>
              {" "}
              It&apos;ll be permanently erased on <strong className="text-white">{formattedDate}</strong>.
            </>
          ) : (
            <> It&apos;ll be permanently erased in 30 days.</>
          )}
        </p>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">
          Changed your mind? Just log back in anytime before then and everything — your progress, your history,
          your settings — comes back exactly as you left it.
        </p>
        <Link
          href="/login"
          className={buttonClasses({ variant: "secondary", hover: "hover", className: "w-full max-w-[300px]" })}
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}

export default function AccountDeletionPage() {
  return (
    <Suspense fallback={null}>
      <AccountDeletionContent />
    </Suspense>
  );
}

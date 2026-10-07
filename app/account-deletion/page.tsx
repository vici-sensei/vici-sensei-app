"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FaClock } from "react-icons/fa6";
import { StatusPage } from "@/app/components/auth/StatusNotice";
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
    <StatusPage
      icon={FaClock}
      tone="blue"
      title="Your account is on hold, not gone"
      actions={
        <Link
          href="/login"
          className={buttonClasses({ variant: "secondary", hover: "hover", className: "w-full max-w-[300px]" })}
        >
          Go to login
        </Link>
      }
    >
      <p>
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
      <p>
        Changed your mind? Just log back in anytime before then and everything — your progress, your history, your
        settings — comes back exactly as you left it.
      </p>
    </StatusPage>
  );
}

export default function AccountDeletionPage() {
  return (
    <Suspense fallback={null}>
      <AccountDeletionContent />
    </Suspense>
  );
}

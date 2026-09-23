"use client";

import { Badge } from "@/app/components/ui/Badge";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { buttonClasses } from "@/app/components/ui/Button";
import { ProTimeLeft } from "@/app/components/ui/ProTimeLeft";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";
import type { UserProfile } from "@/lib/types";

// Pro isn't sold in the app -- it comes with enrolling in the Japanese courses (an admin turns it
// on from /admin/students), so this page only ever points at the courses site, never at Stripe.
const COURSES_URL = "https://vici-sensei.com/";

const PRO_ACTIVE_CLASSES =
  "inline-flex items-center gap-2 text-[0.95rem] font-bold text-accent-gold before:h-2 before:w-2 before:rounded-full before:bg-accent-gold before:shadow-[0_0_8px_var(--color-accent-gold)] before:content-['']";

function CoursesLink() {
  return (
    <a href={COURSES_URL} target="_blank" rel="noopener noreferrer" className={buttonClasses({ hover: "hover" })}>
      Explore our courses
      <FaArrowUpRightFromSquare className="h-3.5 w-3.5" />
    </a>
  );
}

export function BillingPanel({ user }: { user: Pick<UserProfile, "is_premium" | "premium_until"> }) {
  return (
    <GlassCard padding="lg" className="mb-5.5">
      {user.is_premium && !user.premium_until ? (
        <div>
          <span className={PRO_ACTIVE_CLASSES}>Pro active</span>
          <p className="mt-2 text-[0.9rem] leading-[1.6] text-text-muted">
            Congratulations on enrolling in Vici Sensei&apos;s Japanese courses! Your Pro access is included with your
            course, at no extra cost.
          </p>
        </div>
      ) : (
        // Free, or Pro with an end date -- the sign-up trial or an admin-set one. Both get the same
        // pitch; the time-limited one just also shows how long its Pro has left.
        <div className="flex flex-col items-start gap-5">
          <div>
            {user.is_premium ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={PRO_ACTIVE_CLASSES}>Pro active</span>
                <ProTimeLeft user={user} />
              </div>
            ) : (
              <Badge color="blue">Free plan</Badge>
            )}
            <p className="mt-3 text-[0.9rem] leading-[1.6] text-text-muted">
              Pro access to this app is included free of charge for every student enrolled in Vici Sensei&apos;s
              Japanese courses.{" "}
              {user.is_premium
                ? "Enroll to keep your Pro access after it ends."
                : "Enroll to learn with a teacher and unlock everything the app has to offer."}
            </p>
          </div>
          <CoursesLink />
        </div>
      )}
    </GlassCard>
  );
}

"use client";

import type { ReactNode } from "react";
import { FaCalendarDays, FaChalkboardUser, FaTriangleExclamation } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <GlassCard className="mx-auto max-w-lg text-center !h-auto">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-2xl text-accent-gold">{icon}</div>
      <h2 className="mb-2 text-xl font-extrabold">{title}</h2>
      <div className="text-[0.92rem] leading-relaxed text-text-muted">{children}</div>
    </GlassCard>
  );
}

/** The account has no lesson access: never granted, taken away, or its end date has passed. */
export function LessonsNoAccess() {
  return (
    <Notice icon={<FaCalendarDays />} title="Lessons aren't open for your account yet">
      <p>
        Your teacher switches lesson booking on for each student. Once it&rsquo;s on, you&rsquo;ll pick your weekly class here, and you can
        move to another lesson whenever you need to.
      </p>
      <p className="mt-3">Message your teacher to get started.</p>
    </Notice>
  );
}

export function LessonsTeacherNotice() {
  return (
    <Notice icon={<FaChalkboardUser />} title="You're signed in as a teacher">
      <p>Teacher accounts don&rsquo;t book lessons. Your classes and students are in the Teacher panel.</p>
    </Notice>
  );
}

export function LessonsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice icon={<FaTriangleExclamation />} title="Couldn't load your lessons">
      <p>{message}</p>
      <Button className="mt-5" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Notice>
  );
}

export function LessonsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7" aria-busy="true" aria-label="Loading your lessons">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border-soft bg-bg-cards p-3">
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

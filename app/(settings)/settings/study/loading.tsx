import { Skeleton } from "@/app/components/ui/Skeleton";

function StepperSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-6 w-15" />
      <Skeleton className="h-9 w-9 rounded-lg" />
    </div>
  );
}

export default function StudySettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-44" />
      <Skeleton className="mb-6.5 h-5 w-3/4 max-w-100" />

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-[22px]">
          <Skeleton className="mb-2 h-3.5 w-36" />
          <StepperSkeleton />
          <Skeleton className="mt-2.5 h-3.5 w-3/4 max-w-90" />
        </div>
        <div>
          <Skeleton className="mb-2 h-3.5 w-44" />
          <StepperSkeleton />
        </div>
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <Skeleton className="mb-2 h-3.5 w-36" />
        <StepperSkeleton />
        <Skeleton className="mt-2.5 h-3.5 w-2/3 max-w-75" />
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <Skeleton className="mb-3.5 h-3.5 w-32" />
        <div className="flex flex-wrap justify-center gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-15.5 w-15.5 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mx-auto mt-2.5 h-3.5 w-3/4 max-w-90" />
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4">
          <div>
            <Skeleton className="mb-1.5 h-4.5 w-28" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <Skeleton className="h-6.5 w-11.5 shrink-0 rounded-full" />
        </div>
        <div className="flex items-center justify-between gap-5 py-4">
          <div>
            <Skeleton className="mb-1.5 h-4.5 w-36" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          <Skeleton className="h-6.5 w-11.5 shrink-0 rounded-full" />
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-border-soft pt-[22px]">
        <Skeleton className="h-12.5 w-36 rounded-xl" />
      </div>
    </div>
  );
}

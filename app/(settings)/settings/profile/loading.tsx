import { Skeleton } from "@/app/components/ui/Skeleton";

export default function ProfileSettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-28" />
      <Skeleton className="mb-6.5 h-5 w-3/4 max-w-90" />

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-6.5 flex flex-col items-center gap-4 md:flex-row md:gap-5">
          <Skeleton className="h-40 w-40 shrink-0 rounded-2xl" />
          <div className="w-full md:flex-1">
            <Skeleton className="mb-2 h-3.5 w-24" />
            <Skeleton className="h-11.5 w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-28" />
          </div>
        </div>
        <div>
          <Skeleton className="mb-2 h-3.5 w-16" />
          <Skeleton className="h-11.5 w-full" />
          <Skeleton className="mt-1.5 h-3.5 w-3/4 max-w-90" />
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-border-soft pt-[22px]">
        <Skeleton className="h-12.5 w-36 rounded-xl" />
      </div>
    </div>
  );
}

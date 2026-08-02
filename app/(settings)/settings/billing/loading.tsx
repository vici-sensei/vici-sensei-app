import { Skeleton } from "@/app/components/ui/Skeleton";

export default function BillingSettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-24" />
      <Skeleton className="mb-6.5 h-5 w-3/4 max-w-90" />

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <Skeleton className="mb-4 h-7 w-24 rounded-full" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-4.5 w-56" />
              <Skeleton className="h-4.5 w-48" />
              <Skeleton className="h-4.5 w-40" />
            </div>
          </div>
          <Skeleton className="h-12.5 w-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

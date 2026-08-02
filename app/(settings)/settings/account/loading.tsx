import { Skeleton } from "@/app/components/ui/Skeleton";

export default function AccountSettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-6.5 h-5 w-3/4 max-w-90" />

      <div className="rounded-2xl border border-accent-red/20 bg-accent-red/[0.04] px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-1 flex items-center gap-2.5">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-52" />
        </div>
        <Skeleton className="mt-2.5 h-3.5 w-56" />
        <div className="mt-3.5 mb-5 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-3.5 w-60" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="my-5 flex items-start gap-2.5">
          <Skeleton className="mt-[3px] h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-3.5 w-3/4 max-w-90" />
        </div>
        <div className="mb-[22px]">
          <Skeleton className="mb-2 h-3.5 w-40" />
          <Skeleton className="h-11.5 w-full" />
        </div>
        <Skeleton className="h-12.5 w-full rounded-xl" />
      </div>
    </div>
  );
}

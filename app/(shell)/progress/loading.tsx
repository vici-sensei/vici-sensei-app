import { Skeleton } from "@/app/components/ui/Skeleton";

export default function ProgressLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-9 w-60" />
      <Skeleton className="mb-7.5 h-5 w-100 max-w-full" />

      {Array.from({ length: 3 }).map((_, i) => (
        <div className="relative mb-[22px] pl-14" key={i}>
          <Skeleton className="absolute left-0 top-[26px] h-10 w-10 rounded-full" />
          <div className="relative ml-4 rounded-2xl border border-border-soft bg-bg-cards p-7 backdrop-blur-[10px]">
            <Skeleton className="mb-4 h-5 w-40" />
            <Skeleton className="mb-2.5 h-3.5 w-full rounded-lg" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton className="h-4 w-20" key={j} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

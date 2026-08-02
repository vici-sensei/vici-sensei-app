import { Skeleton } from "@/app/components/ui/Skeleton";

export default function KanjiDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-32" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <Skeleton className="h-24 w-24 shrink-0" />
        <div className="min-w-55 flex-1">
          <Skeleton className="mb-3 h-6 w-48" />
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-16" />
          </div>
        </div>
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-32" />
      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton className="h-22 rounded-xl" key={i} />
        ))}
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-32" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );
}

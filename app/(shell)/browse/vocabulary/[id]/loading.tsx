import { Skeleton } from "@/app/components/ui/Skeleton";

export default function VocabularyDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-32" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <Skeleton className="mb-3 mt-1 h-6 w-24" />
          <Skeleton className="mb-3 h-11 w-48" />
          <Skeleton className="mb-3 h-6 w-40" />
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-32" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );
}

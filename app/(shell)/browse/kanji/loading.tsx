import { Skeleton } from "@/app/components/ui/Skeleton";
import { BrowseTabs } from "../BrowseTabs";

export default function BrowseKanjiLoading() {
  return (
    <div>
      <BrowseTabs active="kanji" />
      <Skeleton className="mb-4.5 h-12 w-full" />
      <div className="mb-4.5 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton className="h-10 w-14" key={i} />
        ))}
      </div>

      <Skeleton className="mt-6 mb-3.5 h-3.5 w-20" />

      <div className="mb-6 flex flex-col gap-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            className="flex items-center gap-4.5 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px]"
            key={i}
          >
            <Skeleton className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-4 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

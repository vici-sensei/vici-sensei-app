import { Skeleton } from "@/app/components/ui/Skeleton";
import { GlassCard } from "@/app/components/ui/GlassCard";

export default function DashboardLoading() {
  return (
    <div>
      <div className="relative overflow-hidden rounded-[20px] border border-border-soft bg-bg-cards p-10 backdrop-blur-[10px]">
        <Skeleton className="mb-3 h-9 w-3/4 max-w-100" />
        <Skeleton className="mb-6 h-5 w-1/2 max-w-75" />
        <Skeleton className="h-11 w-40" />
      </div>

      <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard padding="sm" key={i}>
            <Skeleton className="mb-3.5 h-9 w-9 rounded-lg" />
            <Skeleton className="mb-1.5 h-8 w-16" />
            <Skeleton className="h-4 w-24" />
          </GlassCard>
        ))}
      </div>

      <Skeleton className="mt-6 h-5 w-40" />
    </div>
  );
}

import { Skeleton } from "@/app/components/ui/Skeleton";

export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-[60px]">
      <div className="w-full max-w-[560px] text-center">
        <Skeleton className="mx-auto mb-5 h-6 w-28 rounded-full" />
        <Skeleton className="mx-auto mb-3.5 h-9 w-full max-w-md" />
        <div className="mx-auto mb-9 flex max-w-md flex-col items-center gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        <div className="flex flex-wrap justify-center gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-21 w-21 rounded-2xl" />
          ))}
        </div>

        <Skeleton className="mb-8 mt-3.5 h-[52px] w-full rounded-lg" />

        <Skeleton className="h-12.5 w-full rounded-xl" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/app/components/ui/Skeleton";

export default function LoginLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[460px]">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <Skeleton className="h-[26px] w-[26px] rounded-full" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="mx-auto mb-5 h-6 w-56 rounded-full" />
        <Skeleton className="mx-auto mb-2 h-10 w-3/4" />
        <Skeleton className="mx-auto mb-2 h-10 w-1/2" />
        <div className="mx-auto mb-10 mt-2 flex flex-col items-center gap-2">
          <Skeleton className="h-4 w-full max-w-[420px]" />
          <Skeleton className="h-4 w-3/4 max-w-[340px]" />
        </div>

        <Skeleton className="mx-auto h-12.5 w-full max-w-[360px] rounded-xl" />

        <Skeleton className="mx-auto mt-[18px] h-3.5 w-3/4 max-w-[360px]" />
      </div>
    </div>
  );
}

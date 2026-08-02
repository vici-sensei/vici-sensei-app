import { Skeleton } from "@/app/components/ui/Skeleton";

export default function SessionExpiredLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[440px]">
        <Skeleton className="mx-auto mb-5.5 h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto mb-2.5 h-7 w-64" />
        <Skeleton className="mx-auto mb-7 h-4.5 w-48" />
        <Skeleton className="mx-auto h-4.5 w-44 rounded-full" />
      </div>
    </div>
  );
}

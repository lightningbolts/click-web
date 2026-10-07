import { Skeleton } from "@/components/ds/Skeleton";

/** The Click Pass ticket's shape, so it lands without a jump. */
export default function EventPassLoading() {
  return (
    <div className="route-loading container-content pb-16 pt-4 md:pt-8" role="status" aria-label="Loading your Click Pass">
      <div className="mx-auto w-full max-w-[440px]">
        <Skeleton rounded="sm" className="mb-5 h-5 w-16" />
        <div className="overflow-hidden rounded-xl bg-surface">
          <Skeleton className="aspect-[2/1] w-full rounded-none" />
          <div className="space-y-2.5 p-5">
            <Skeleton rounded="sm" className="h-6 w-3/4" />
            <Skeleton rounded="sm" className="h-4 w-1/2" />
          </div>
          <div className="flex flex-col items-center gap-3.5 p-5 pt-[42px]">
            <Skeleton rounded="lg" shimmer className="aspect-square w-full max-w-[260px]" />
            <Skeleton rounded="sm" className="h-7 w-28" />
            <Skeleton rounded="lg" className="h-16 w-full" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading your Click Pass…</span>
    </div>
  );
}

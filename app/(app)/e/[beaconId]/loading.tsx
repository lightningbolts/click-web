import { Skeleton } from "@/components/ds/Skeleton";

/** Mirrors the event page grid (spec §7.6.2) so content lands without a jump. */
export default function EventDetailLoading() {
  return (
    <div
      className="container-page grid gap-6 pb-24 pt-6 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10 min-[900px]:pt-8"
      role="status"
      aria-label="Loading event"
      data-testid="event-route-loading"
    >
      <Skeleton rounded="xl" className="aspect-video w-full min-[900px]:aspect-square" />
      <div className="space-y-4">
        <Skeleton rounded="sm" className="h-9 w-3/4" />
        <div className="space-y-3 pt-2">
          <Skeleton rounded="md" className="h-12 w-2/3" />
          <Skeleton rounded="md" className="h-12 w-1/2" />
        </div>
        <Skeleton rounded="xl" className="h-36 w-full" />
        <Skeleton rounded="sm" className="h-4 w-full" />
        <Skeleton rounded="sm" className="h-4 w-5/6" />
      </div>
      <span className="sr-only">Loading event…</span>
    </div>
  );
}

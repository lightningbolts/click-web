import { EventRowSkeleton } from "@/components/ds/EventRow";
import { Skeleton } from "@/components/ds/Skeleton";

export default function EventsLoading() {
  return (
    <div className="route-loading container-content pb-24 pt-8 md:pt-12" role="status" aria-label="Loading events" data-testid="event-route-loading">
      <Skeleton rounded="sm" className="h-9 w-40" />
      <Skeleton rounded="sm" className="mt-2 h-5 w-72 max-w-full" />
      <Skeleton rounded="full" className="mb-8 mt-6 h-10 w-full" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <EventRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

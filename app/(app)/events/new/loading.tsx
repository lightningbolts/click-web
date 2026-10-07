import { Skeleton } from "@/components/ds/Skeleton";

export default function NewEventLoading() {
  return (
    <div className="route-loading container-page pb-16 pt-6 md:pt-10" data-testid="event-form-loading" aria-busy>
      <Skeleton className="mb-6 h-9 w-48 md:mb-8" />
      <div className="grid items-start gap-8 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10">
        <Skeleton rounded="xl" className="aspect-square w-full" />
        <div className="space-y-8">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton rounded="lg" className="h-40 w-full" />
          <Skeleton rounded="md" className="h-11 w-full" />
          <Skeleton rounded="lg" className="h-56 w-full" />
        </div>
      </div>
    </div>
  );
}

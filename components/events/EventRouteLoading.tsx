import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";
import { cn } from "@/lib/cn";

export function EventCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-border-hard bg-surface",
        featured ? "md:flex" : "flex min-h-28",
      )}
    >
      <div
        className={
          featured
            ? "h-48 w-full shrink-0 animate-pulse bg-surface-container md:min-h-[16rem] md:w-[42%]"
            : "w-28 shrink-0 animate-pulse self-stretch bg-surface-container sm:w-32"
        }
      />
      <div className="min-w-0 flex-1 space-y-2 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-container" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-container" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-container" />
      </div>
    </div>
  );
}

export default function EventRouteLoading({
  variant = "list",
}: {
  variant?: "list" | "detail" | "form";
}) {
  const label =
    variant === "detail" ? "Loading event" : variant === "form" ? "Loading event form" : "Loading events";

  return (
    <div className={cn(PAGE_COLUMN_CLASS, "py-10")} role="status" aria-label={label} data-testid="event-route-loading">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-container" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-container" />
      </div>
      {variant === "detail" ? (
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-[16px] bg-surface-container md:h-80" />
          <div className="h-48 animate-pulse rounded-[16px] border border-border-hard bg-surface" />
        </div>
      ) : variant === "form" ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="aspect-[4/5] animate-pulse rounded-[16px] bg-surface-container" />
          <div className="space-y-3">
            <div className="h-11 animate-pulse rounded-[16px] bg-surface-container" />
            <div className="h-28 animate-pulse rounded-[16px] bg-surface-container" />
            <div className="h-24 animate-pulse rounded-[16px] bg-surface-container" />
            <div className="h-11 animate-pulse rounded-[16px] bg-surface-container" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <EventCardSkeleton featured />
          <EventCardSkeleton />
          <EventCardSkeleton />
        </div>
      )}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

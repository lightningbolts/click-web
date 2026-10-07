import { Skeleton } from '@/components/ds/Skeleton';

/** Rows of a list group: avatar or icon, two lines (spec §5.6, exact row height). */
function Rows({ count, avatar = true }: { count: number; avatar?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-16 items-center gap-3 px-4 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
          <Skeleton rounded={avatar ? 'full' : 'sm'} className={avatar ? 'size-10 shrink-0' : 'size-7 shrink-0'} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton rounded="sm" className="h-4 w-2/5" />
            <Skeleton rounded="sm" className="h-3.5 w-3/5" />
          </span>
        </div>
      ))}
    </div>
  );
}

function Title({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <div className={subtitle ? 'mb-8' : 'mb-4'}>
      <Skeleton rounded="sm" className="h-9 w-40" />
      {subtitle ? <Skeleton rounded="sm" className="mt-2 h-5 w-72 max-w-full" /> : null}
    </div>
  );
}

/**
 * Route-level loading states for server-rendered tabs: shown the instant a link is followed
 * (the shell stays), shaped like the page that replaces them so nothing jumps when it lands.
 */
export function RouteSkeleton({ variant, label }: { variant: 'list' | 'me' | 'settings' | 'workspace' | 'places'; label: string }) {
  const status = { role: 'status', 'aria-label': label, 'aria-busy': true } as const;

  if (variant === 'me') {
    return (
      <div {...status} className="route-loading container-page pb-16 pt-6 md:pt-10">
        <div className="grid gap-10 md:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <Skeleton rounded="full" className="size-24" shimmer />
            <Skeleton rounded="sm" className="mt-4 h-8 w-48" />
            <Skeleton rounded="sm" className="mt-2 h-4 w-24" />
            <div className="mt-5 flex gap-2">
              <Skeleton rounded="pill" className="h-8 w-28" />
              <Skeleton rounded="pill" className="h-8 w-24" />
            </div>
          </div>
          <div className="flex flex-col gap-8">
            <Rows count={3} avatar={false} />
            <Rows count={4} avatar={false} />
          </div>
        </div>
      </div>
    );
  }
  if (variant === 'settings') {
    return (
      <div {...status} className="route-loading">
        <Skeleton rounded="sm" className="h-7 w-40" />
        <Skeleton rounded="sm" className="mb-6 mt-1.5 h-5 w-72 max-w-full" />
        <Rows count={4} avatar={false} />
      </div>
    );
  }
  if (variant === 'workspace') {
    return (
      <div {...status} className="route-loading grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} rounded="lg" className="h-[92px]" shimmer />
            ))}
          </div>
          <Rows count={3} avatar={false} />
        </div>
        <Skeleton rounded="lg" className="h-56" shimmer />
      </div>
    );
  }
  if (variant === 'places') {
    return (
      <div {...status} className="route-loading container-wide pb-16 pt-6 md:pt-10">
        <Title subtitle />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} rounded="lg" className="aspect-[16/14]" shimmer />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div {...status} className="route-loading container-content pb-16 pt-6 md:pt-10">
      <Title />
      <Rows count={6} />
    </div>
  );
}

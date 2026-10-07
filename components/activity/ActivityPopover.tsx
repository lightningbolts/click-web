'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/Popover';
import { RetryRow } from '@/components/ds/RetryRow';
import { Skeleton } from '@/components/ds/Skeleton';
import { useMediaQuery } from '@/components/ds/useMediaQuery';
import { requestConnectionId } from '@/lib/activity/activityView';
import { markSeen, preloadActivity, useLatestActivity } from './activityData';
import { ActivityRow } from './ActivityRow';

const SHOWN = 8;

function PopoverBody({ onNavigate }: { onNavigate: () => void }) {
  const { data, error, isLoading, mutate } = useLatestActivity();
  // eslint-disable-next-line react-hooks/purity -- relative ages only
  const nowMs = Date.now();
  const items = (data?.items ?? []).slice(0, SHOWN);
  const seenMs = data?.seen_at ? Date.parse(data.seen_at) : Number.NEGATIVE_INFINITY;
  const pending = new Set(data?.pending_requests ?? []);
  const anyNew = items.some((i) => Date.parse(i.created_at) > seenMs);

  return (
    <div className="flex max-h-[520px] w-[380px] max-w-[calc(100vw-24px)] flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="type-headline text-fg">Activity</h2>
        {anyNew ? (
          <Button
            variant="plain"
            size="sm"
            onClick={() => void markSeen(data!.items)}
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onClick={(e) => (e.target as HTMLElement).closest('a') && onNavigate()}>
        {isLoading && !data ? (
          <div aria-busy className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" rounded="md" />
            ))}
          </div>
        ) : error ? (
          <RetryRow thing="activity" onRetry={() => void mutate()} className="m-3" />
        ) : items.length === 0 ? (
          <p className="type-body px-4 py-8 text-center text-fg-secondary">Nothing here yet.</p>
        ) : (
          <ul className="[&>li+li]:shadow-[inset_0_1px_0_var(--hairline)]">
            {items.map((item) => {
              const req = requestConnectionId(item);
              return (
                <ActivityRow
                  key={item.id}
                  item={item}
                  nowMs={nowMs}
                  isNew={Date.parse(item.created_at) > seenMs}
                  pendingRequestId={req && pending.has(req) ? req : null}
                  compact
                />
              );
            })}
          </ul>
        )}
      </div>
      <Link
        href="/activity"
        onClick={onNavigate}
        className="type-body-strong flex h-11 shrink-0 items-center justify-center text-accent shadow-[inset_0_1px_0_var(--hairline)] hover:bg-hover"
      >
        See all
      </Link>
    </div>
  );
}

/**
 * The top-bar bell (spec §6.1 / §7.9): a popover with the latest 8 on desktop, the Activity page
 * on phones. The dot shows unseen activity from the session bootstrap, kept live by `LiveActivity`.
 */
export function ActivityBell({ hasNew }: { hasNew: boolean }) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const label = hasNew ? 'Activity, new' : 'Activity';
  if (!desktop) return <IconButton icon={Bell} href="/activity" aria-label={label} dot={hasNew} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Read ahead on hover or focus, so the popover opens with its rows already there. */}
        <IconButton icon={Bell} aria-label={label} dot={hasNew} onPointerEnter={preloadActivity} onFocus={preloadActivity} />
      </PopoverTrigger>
      <PopoverContent className="p-0" data-testid="activity-popover">
        <PopoverBody onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { EmptyState } from '@/components/ds/EmptyState';
import { groupActivity, requestConnectionId } from '@/lib/activity/activityView';
import { authedJson } from '@/lib/api/authedJson';
import { ActivityRow, type ActivityRowItem } from './ActivityRow';

export type ActivityPage = {
  items: ActivityRowItem[];
  seen_at: string | null;
  next_before: string | null;
  pending_requests: string[];
};

/** Tells the server the newest item was seen; clears the bell dot (fire and forget). */
export function markSeen(items: { created_at: string }[]): Promise<unknown> {
  const newest = items[0]?.created_at;
  return newest ? authedJson('/api/activity/seen', { method: 'POST', body: { seen_at: newest } }).catch(() => undefined) : Promise.resolve();
}

/**
 * The Activity page list (spec §7.9): New / Today / Yesterday / This week / Earlier under sticky
 * headers, server-rendered first page, "Show more" for older ones. Opening it marks items seen.
 */
export function ActivityFeed({ initial, nowMs, timeZone }: { initial: ActivityPage; nowMs: number; timeZone: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [pending, setPending] = useState(() => new Set(initial.pending_requests));
  const [next, setNext] = useState(initial.next_before);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // "New" stays as it was when the page opened, even after it's marked seen.
  const [seenAt] = useState(initial.seen_at);

  useEffect(() => {
    void markSeen(initial.items).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, []);

  const more = async () => {
    if (!next) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await authedJson<ActivityPage>(`/api/activity?before=${encodeURIComponent(next)}`);
      setItems((cur) => [...cur, ...page.items]);
      setPending((cur) => new Set([...cur, ...page.pending_requests]));
      setNext(page.next_before);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return <EmptyState icon={Bell} title="Nothing here yet" body="Reactions, RSVPs, new Clicks and requests show up here." />;
  }

  const groups = groupActivity(items, { seenAt, nowMs, timeZone });
  return (
    <div data-testid="activity-feed">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`activity-${g.key}`} className="pb-6">
          <h2 id={`activity-${g.key}`} className="type-headline material-glass sticky top-[var(--topbar-height)] z-10 -mx-[var(--gutter)] px-[var(--gutter)] py-2 text-fg sm:mx-0 sm:px-0">
            {g.title}
          </h2>
          <ul className="mt-1 overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)] [&>li+li]:shadow-[inset_0_1px_0_var(--hairline)]">
            {g.items.map((item) => {
              const req = requestConnectionId(item);
              return (
                <ActivityRow
                  key={item.id}
                  item={item}
                  nowMs={nowMs}
                  isNew={g.key === 'new'}
                  pendingRequestId={req && pending.has(req) ? req : null}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {next ? (
        <div className="flex flex-col items-center gap-2">
          {failed ? <p className="type-meta text-destructive">Couldn’t load older activity.</p> : null}
          <Button variant="secondary" loading={loading} onClick={() => void more()}>
            {failed ? 'Retry' : 'Show more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

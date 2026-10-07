'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { EmptyState } from '@/components/ds/EmptyState';
import { groupActivity, mergeActivity, requestConnectionId } from '@/lib/activity/activityView';
import { fetchActivityPage, markSeen, useLatestActivity, type ActivityPage } from './activityData';
import { ActivityRow, type ActivityRowItem } from './ActivityRow';

/**
 * The Activity page list (spec §7.9): New / Today / Yesterday / This week / Earlier under sticky
 * headers, server-rendered first page, "Show more" for older ones. Live: items arriving while
 * it's open join the top (and are marked seen, so the bell stays clear).
 */
export function ActivityFeed({ initial, nowMs: renderedNowMs, timeZone }: { initial: ActivityPage; nowMs: number; timeZone: string }) {
  const { data: latest = initial } = useLatestActivity(initial);
  const [older, setOlder] = useState<{ items: ActivityRowItem[]; pending: string[] }>({ items: [], pending: [] });
  const [next, setNext] = useState(initial.next_before);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // "New" stays as it was when the page opened, even after it's marked seen.
  const [seenAt] = useState(initial.seen_at);
  const [nowMs, setNowMs] = useState(renderedNowMs);

  // The live page can be fresher than the rendered one (or the reverse, from a popover read
  // earlier): merge, so nothing is dropped and "Show more" carries on from the oldest loaded.
  const items = useMemo(() => mergeActivity(latest.items, initial.items, older.items), [latest.items, initial.items, older.items]);
  const pending = useMemo(
    () => new Set([...latest.pending_requests, ...older.pending]),
    [latest.pending_requests, older.pending],
  );

  const newest = items[0]?.created_at;
  useEffect(() => {
    if (!newest) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- relative ages for rows that just arrived
    setNowMs(Math.max(renderedNowMs, Date.now()));
    void markSeen([{ created_at: newest }]);
  }, [newest, renderedNowMs]);

  const more = async () => {
    if (!next) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchActivityPage(`/api/activity?before=${encodeURIComponent(next)}`);
      setOlder((cur) => ({ items: [...cur.items, ...page.items], pending: [...cur.pending, ...page.pending_requests] }));
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

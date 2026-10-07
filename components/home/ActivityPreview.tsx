'use client';

import { Bell } from 'lucide-react';
import { useLatestActivity } from '@/components/activity/activityData';
import { Avatar } from '@/components/ds/Avatar';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { activityHref } from '@/lib/activity/activityHref';
import { mergeActivity } from '@/lib/activity/activityView';
import { formatRelativeShort } from '@/lib/home/format';
import type { HomeActivityRow } from '@/lib/home/types';

const SHOWN = 5;

/** Rail: the latest five Activity rows, live (new ones join the top while Home is open). */
export function ActivityPreview({ items: rendered, nowMs }: { items: HomeActivityRow[]; nowMs: number }) {
  const { data } = useLatestActivity({ items: rendered, seen_at: null, next_before: null, pending_requests: [] });
  const items = mergeActivity(data?.items ?? [], rendered).slice(0, SHOWN);
  return (
    <section aria-labelledby="home-activity">
      <SectionHeader id="home-activity" title="Activity" href="/activity" linkLabel="Open Activity" />
      {items.length === 0 ? (
        <p className="type-body rounded-lg bg-surface p-4 text-fg-tertiary">
          Reactions, RSVPs and new Clicks will show up here.
        </p>
      ) : (
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.id}
              href={activityHref(item)}
              chevron={false}
              icon={item.actor ? undefined : Bell}
              leading={
                item.actor ? (
                  <Avatar seed={item.actor.id} name={item.actor.name} src={item.actor.avatar_url} size={32} />
                ) : undefined
              }
              title={item.title}
              subtitle={item.body || undefined}
              trailing={<span className="type-meta tabular">{formatRelativeShort(item.created_at, nowMs)}</span>}
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}

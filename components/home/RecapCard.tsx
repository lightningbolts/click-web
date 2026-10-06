'use client';

import { useState } from 'react';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import type { ActivityRecap, RecapWindow } from '@/lib/me/activityRecap';

const ROWS: [keyof ActivityRecap, string][] = [
  ['connections_formed', 'New Clicks'],
  ['messages_sent', 'Messages sent'],
  ['messages_received', 'Messages received'],
  ['events_rsvped', 'Event RSVPs'],
  ['events_checked_in', 'Check-ins'],
  ['events_saved', 'Events saved'],
  ['beacons_created', 'Beacons dropped'],
];

/** ⑦ Your recap: Day / Week over the server-loaded rollups (no refetch on switch). */
export function RecapCard({ recap }: { recap: { day: ActivityRecap; week: ActivityRecap } }) {
  const [period, setPeriod] = useState<RecapWindow>('week');
  const current = recap[period];
  const empty = ROWS.every(([key]) => !current[key]);
  return (
    <section aria-labelledby="home-recap">
      <SectionHeader
        id="home-recap"
        title="Your recap"
        action={
          <SegmentedControl
            label="Recap period"
            size="sm"
            className="w-[132px]"
            fullWidth
            value={period}
            onChange={setPeriod}
            segments={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
            ]}
          />
        }
      />
      {empty ? (
        <p className="type-body rounded-lg bg-surface p-4 text-fg-tertiary">
          {period === 'day' ? 'A quiet day so far.' : 'A quiet week so far.'} Your next Click starts in person.
        </p>
      ) : (
        <ListGroup>
          {ROWS.filter(([key]) => current[key]).map(([key, label]) => (
            <ListRow key={key} title={label} trailing={<span className="tabular text-fg">{current[key] as number}</span>} />
          ))}
        </ListGroup>
      )}
    </section>
  );
}

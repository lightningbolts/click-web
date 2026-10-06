'use client';

import { usePathname, useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/ds/SegmentedControl';

export type HistoryView = 'clicks' | 'events' | 'milestones';

/** Clicks / Events / Milestones, kept in `?view=` so Back and links work (spec §10.1). */
export function HistoryViewControl({ value }: { value: HistoryView }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <SegmentedControl<HistoryView>
      label="History view"
      value={value}
      onChange={(v) => router.push(v === 'clicks' ? pathname : `${pathname}?view=${v}`, { scroll: false })}
      segments={[
        { value: 'clicks', label: 'Clicks' },
        { value: 'events', label: 'Events' },
        { value: 'milestones', label: 'Milestones' },
      ]}
      fullWidth
    />
  );
}

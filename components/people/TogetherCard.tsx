'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Coffee, Hand, Heart, Infinity as InfinityIcon, Plus, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { Card } from '@/components/ds/Card';
import type { FriendshipLevel, FriendshipStats } from '@/lib/people/friendship';

// MapLibre loads only once the card scrolls into view (spec §7.3, §11.2).
const PinMap = dynamic(() => import('@/components/maps/PinMap'), {
  ssr: false,
  loading: () => <div className="ds-skeleton h-[180px] rounded-md" aria-hidden />,
});

const LEVEL_ICON: Record<FriendshipLevel['name'], LucideIcon> = {
  'New Click': Sparkles,
  Familiar: Hand,
  Regulars: Coffee,
  Close: Heart,
  Inseparable: InfinityIcon,
};

function monthYear(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function LazyMap({ pins }: { pins: FriendshipStats['pins'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="mt-4 h-[180px] overflow-hidden rounded-md bg-fill-subtle">
      {visible ? <PinMap markers={pins} className="h-[180px] w-full rounded-md border-0" testId="together-map" /> : null}
    </div>
  );
}

/** Level, progress, stats and the places you've met (spec §7.3 "Together"). */
export function TogetherCard({
  stats,
  firstName,
  onLogHangout,
  logging,
}: {
  stats: FriendshipStats;
  firstName: string;
  onLogHangout: () => void;
  logging: boolean;
}) {
  const Icon = LEVEL_ICON[stats.level.name];
  const toNext = stats.nextLevel ? stats.nextLevel.threshold - stats.hangouts : 0;

  return (
    <Card as="section" aria-labelledby="together-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="together-title" className="type-headline text-fg">
          Together
        </h2>
        <span className="type-body-strong inline-flex items-center gap-1.5 text-accent">
          <Icon size={18} aria-hidden />
          {stats.level.name}
        </span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-pill bg-fill-subtle"
        role="progressbar"
        aria-label="Friendship level progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(stats.progress * 100)}
      >
        <div className="h-full rounded-pill bg-action" style={{ width: `${Math.round(stats.progress * 100)}%` }} />
      </div>
      <p className="type-meta mt-2 text-fg-tertiary">
        {stats.nextLevel
          ? `${toNext} more ${toNext === 1 ? 'hangout' : 'hangouts'} to ${stats.nextLevel.name}`
          : `You and ${firstName} are at the top level`}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Hangouts', value: String(stats.hangouts) },
          { label: 'Places', value: String(stats.places) },
          { label: 'Since', value: monthYear(stats.firstMetIso) },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-fill-subtle px-2 py-3">
            <dt className="type-meta text-fg-tertiary">{s.label}</dt>
            <dd className="type-title-3 tabular mt-0.5 truncate text-fg">{s.value}</dd>
          </div>
        ))}
      </dl>

      {stats.pins.length > 0 ? <LazyMap pins={stats.pins} /> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={Plus} loading={logging} onClick={onLogHangout}>
          Log hangout
        </Button>
        <Button variant="secondary" size="sm" icon={CalendarPlus} href="/events/new">
          Plan
        </Button>
      </div>
    </Card>
  );
}

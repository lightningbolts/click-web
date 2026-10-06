'use client';

import { ArrowUpRight, Copy, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { toast } from '@/components/ds/Toast';

const PinMap = dynamic(() => import('@/components/maps/PinMap'), { ssr: false, loading: () => <MapPanel loading /> });

function MapPanel({ loading, onShow }: { loading?: boolean; onShow?: () => void }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-lg bg-surface-raised text-fg-secondary">
      <MapPin size={24} strokeWidth={1.75} aria-hidden />
      {onShow ? (
        <Button variant="plain" size="sm" onClick={onShow}>
          Show map
        </Button>
      ) : (
        <span className="type-meta">{loading ? 'Loading map…' : 'Map'}</span>
      )}
    </div>
  );
}

/**
 * Location (spec §7.6.2): address with copy, then a 220-tall map that only loads MapLibre
 * once the section scrolls near the viewport, so it never competes with the cover for LCP.
 */
export function EventLocationSection({
  beaconId,
  label,
  lat,
  lng,
  mapsUrl,
}: {
  beaconId: string;
  label: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const hasPin = lat != null && lng != null;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasPin || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasPin]);

  return (
    <section aria-labelledby="event-location">
      <SectionHeader id="event-location" title="Location" />
      <div className="mt-3 flex items-center gap-2">
        <p className="type-body min-w-0 flex-1 text-fg">{label}</p>
        <IconButton
          icon={Copy}
          size="sm"
          aria-label="Copy address"
          onClick={() =>
            void navigator.clipboard.writeText(label).then(
              () => toast.success('Address copied'),
              () => toast.error('Couldn’t copy the address.'),
            )
          }
        />
        {mapsUrl ? (
          <IconButton icon={ArrowUpRight} size="sm" href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Maps" />
        ) : null}
      </div>
      {hasPin ? (
        <div ref={ref} className="mt-3">
          {show ? (
            <PinMap
              testId="event-pin-map"
              className="h-[220px] rounded-lg border-0"
              markers={[{ id: beaconId, lat, lng, label }]}
            />
          ) : (
            <MapPanel onShow={() => setShow(true)} />
          )}
        </div>
      ) : null}
    </section>
  );
}

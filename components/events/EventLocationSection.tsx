'use client';

import { ArrowUpRight, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { EventWeatherLine } from '@/components/events/EventWeatherLine';
import { MapsMenu } from '@/components/events/MapsMenu';

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
 * Location (spec §7.6.2, 06 §3–4): the place, its street address and the weather there, opening
 * in Apple or Google Maps; then a 220-tall map that only loads MapLibre once the section scrolls
 * near the viewport, so it never competes with the cover for LCP.
 */
export function EventLocationSection({
  beaconId,
  label,
  address,
  lat,
  lng,
  weather,
}: {
  beaconId: string;
  label: string;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  /** Weather now and at the start; null for ended events and Places. */
  weather?: { forecastAt: string | null; timeZone: string } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const hasPin = lat != null && lng != null;
  const street = address?.trim() && address.trim() !== label ? address.trim() : null;

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
      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="type-body text-fg">{label}</p>
          {street ? <p className="type-meta mt-0.5 text-fg-secondary">{street}</p> : null}
          {weather && hasPin ? <EventWeatherLine lat={lat} lng={lng} forecastAt={weather.forecastAt} timeZone={weather.timeZone} /> : null}
        </div>
        <MapsMenu
          destination={{ lat, lng, name: label, address }}
          trigger={<IconButton icon={ArrowUpRight} size="sm" aria-label="Open in Maps" />}
        />
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

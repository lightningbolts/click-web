'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { PinMapMarker } from './PinMap';

const PinMap = dynamic(() => import('./PinMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-64 items-center justify-center rounded-[16px] border border-hairline bg-surface-raised"
      data-testid="pin-map-loading"
    >
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
      <span className="sr-only">Loading map…</span>
    </div>
  ),
});

export default function PinMapLazy(props: {
  markers: PinMapMarker[];
  className?: string;
  testId?: string;
  maxBounds?: import('maplibre-gl').LngLatBoundsLike;
}) {
  return <PinMap {...props} />;
}

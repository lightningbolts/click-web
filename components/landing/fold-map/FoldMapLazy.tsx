'use client';

import dynamic from 'next/dynamic';
import type { PresenceHeatmapCell } from '@/lib/landing/presenceHeatmap';

/**
 * Code-split MapLibre so anonymous `/` does not ship the GL bundle until
 * the Fold Map hero hydrates (Cloudflare Worker JS budget).
 */
const FoldMap = dynamic(() => import('./FoldMap'), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 bg-[#ebeef1] dark:bg-[#15121c]"
      data-testid="fold-map-loading"
      aria-hidden
    />
  ),
});

export default function FoldMapLazy({ cells }: { cells: readonly PresenceHeatmapCell[] }) {
  return <FoldMap cells={cells} />;
}

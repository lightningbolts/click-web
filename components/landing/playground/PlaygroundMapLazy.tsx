'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/**
 * Code-split MapLibre so anonymous `/` does not ship the GL bundle until
 * the visitor opens the playground map (Cloudflare Worker JS budget).
 */
const PlaygroundMapLazy = dynamic(() => import('./PlaygroundMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full min-h-[240px] items-center justify-center rounded-[16px] border border-hairline bg-surface-raised"
      data-testid="playground-map-loading"
    >
      <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
      <span className="sr-only">Loading map...</span>
    </div>
  ),
});

export default PlaygroundMapLazy;

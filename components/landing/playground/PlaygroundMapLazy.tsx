'use client';

import dynamic from 'next/dynamic';

/**
 * Code-split MapLibre so anonymous `/` does not ship the GL bundle until
 * the visitor opens a map in the playground (Cloudflare Worker JS budget).
 */
const PlaygroundMapLazy = dynamic(() => import('./PlaygroundMap'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-raised" data-testid="playground-map-loading" />,
});

export default PlaygroundMapLazy;

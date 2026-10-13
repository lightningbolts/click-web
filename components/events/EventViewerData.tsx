'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

/**
 * Seeds the event page's shared SWR reads (who's going, your Clicks there) with what the server
 * read, so the going line, people, RSVP and chat render with the page. SWR still owns them after:
 * RSVPs update them optimistically and revalidate as before.
 */
export function EventViewerData({ fallback, children }: { fallback: Record<string, unknown>; children: ReactNode }) {
  return <SWRConfig value={{ fallback }}>{children}</SWRConfig>;
}

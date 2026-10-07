import type { Metadata } from 'next';
import { MapScreen } from '@/components/map/MapScreen';
import { loadInboxPreload } from '@/lib/server/clicks/inboxPreload';

export const metadata: Metadata = { title: 'Map · Click' };

/** The connections' first load starts here, unawaited, and streams to the map with the page. */
export default function MapPage() {
  return <MapScreen preload={loadInboxPreload()} />;
}

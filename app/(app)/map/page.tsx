import type { Metadata } from 'next';
import { MapScreen } from '@/components/map/MapScreen';

export const metadata: Metadata = { title: 'Map · Click' };

export default function MapPage() {
  return <MapScreen />;
}

'use client';

import { Copy, Map as MapIcon, Navigation } from 'lucide-react';
import type { ReactNode } from 'react';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ds/Menu';
import { toast } from '@/components/ds/Toast';
import { appleMapsUrl, googleMapsUrl, type MapsDestination } from '@/lib/events/mapsLinks';

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address);
    toast.success('Address copied');
  } catch {
    toast.error('Couldn’t copy the address.');
  }
}

/**
 * "Open in…" for a place (spec 06 §3, iOS `mapsDialog`): Apple Maps, Google Maps and Copy address
 * (the street address, else the name). `directions` routes to it (the Directions action) instead of
 * showing it.
 */
export function MapsMenu({
  destination,
  directions = false,
  trigger,
}: {
  destination: MapsDestination;
  directions?: boolean;
  trigger: ReactNode;
}) {
  const copyable = destination.address?.trim() || destination.name.trim();
  return (
    <Menu>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align="end" className="min-w-56">
        <MenuLabel className="type-meta truncate text-fg-tertiary">{directions ? 'Get directions' : destination.name}</MenuLabel>
        <MenuItem asChild icon={MapIcon}>
          <a href={appleMapsUrl(destination, directions)} target="_blank" rel="noopener noreferrer">
            Apple Maps
          </a>
        </MenuItem>
        <MenuItem asChild icon={Navigation}>
          <a href={googleMapsUrl(destination, directions)} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        </MenuItem>
        {copyable ? (
          <>
            <MenuSeparator />
            <MenuItem icon={Copy} onSelect={() => void copyAddress(copyable)}>
              Copy address
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

import { eventWhereLabel } from '@/lib/events/eventMetadata';
import type { PublicEventPayload } from '@/lib/events/publicEvent';

/**
 * "Open in…" targets for a place (spec 06 §3): Apple Maps and Google Maps, either routing to it
 * (Directions) or just showing it (the location card). Only the destination leaves Click; the
 * viewer's own location is never sent.
 */
export type MapsDestination = {
  lat: number | null;
  lng: number | null;
  /** What the place is called ("Cafe Allegro"); the search when there's no pin. */
  name: string;
  /** Street address, when known: shown and copyable. */
  address?: string | null;
};

function point(d: MapsDestination): string | null {
  return d.lat != null && d.lng != null ? `${d.lat},${d.lng}` : null;
}

/** The pin, else the address or name as a search. */
function query(d: MapsDestination): string {
  return point(d) ?? (d.address?.trim() || d.name);
}

export function appleMapsUrl(d: MapsDestination, directions: boolean): string {
  const at = point(d);
  const p = new URLSearchParams(
    directions ? { daddr: query(d) } : at ? { ll: at, q: d.name } : { q: query(d) },
  );
  return `https://maps.apple.com/?${p}`;
}

export function googleMapsUrl(d: MapsDestination, directions: boolean): string {
  const p = new URLSearchParams({ api: '1', [directions ? 'destination' : 'query']: query(d) });
  return `https://www.google.com/maps/${directions ? 'dir' : 'search'}/?${p}`;
}

/** Where an event is, for the maps chooser; null when it has no place at all. */
export function eventMapsDestination(event: PublicEventPayload): MapsDestination | null {
  const name = eventWhereLabel(event.location_name) ?? event.address?.trim();
  const hasPin = event.latitude != null && event.longitude != null;
  if (!name && !hasPin) return null;
  return { lat: event.latitude, lng: event.longitude, name: name || 'Event location', address: event.address };
}

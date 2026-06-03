import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenueFromEncounter } from '@/lib/enrichment/encounterVenueResolver';
import { fetchVenueFromOverpass } from '@/lib/enrichment/overpassClient';
import { saveVenueToCache } from '@/lib/enrichment/eventCache';

export type VenueResolutionHints = {
  location_name?: string | null;
  semantic_location?: unknown;
  /** When true, only use encounter Nominatim / location_name (no Overpass). */
  skip_overpass?: boolean;
};

export type VenueResolutionResult = {
  venue_name: string | null;
  source: 'encounter' | 'overpass' | null;
  degraded: boolean;
};

/**
 * Resolve venue after grid cache miss: encounter row data first, then Overpass.
 */
export async function resolveEventVenueName(
  supabase: SupabaseClient,
  lat: number,
  lon: number,
  hints: VenueResolutionHints,
): Promise<VenueResolutionResult> {
  const localVenue = resolveVenueFromEncounter({
    location_name: hints.location_name,
    semantic_location: hints.semantic_location,
  });

  if (localVenue) {
    await saveVenueToCache(supabase, lat, lon, localVenue);
    return { venue_name: localVenue, source: 'encounter', degraded: false };
  }

  if (hints.skip_overpass) {
    return { venue_name: null, source: null, degraded: true };
  }

  const overpassVenue = await fetchVenueFromOverpass(lat, lon);
  if (overpassVenue) {
    await saveVenueToCache(supabase, lat, lon, overpassVenue);
    return { venue_name: overpassVenue, source: 'overpass', degraded: false };
  }

  return { venue_name: null, source: null, degraded: true };
}

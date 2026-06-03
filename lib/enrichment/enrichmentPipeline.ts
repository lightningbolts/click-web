import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnrichmentPipelineResult } from '@/types/enrichment-schema';
import { toEventDate } from '@/lib/enrichment/gridCoords';
import {
  findRegistryEventByVenueAndDate,
  getVenueFromCache,
  insertRegistryEvent,
  linkEncounterToEvent,
  saveVenueToCache,
} from '@/lib/enrichment/eventCache';
import { fetchVenueFromOverpass } from '@/lib/enrichment/overpassClient';
import {
  fetchEventFromTicketmaster,
  fetchSportsFallbackEvent,
} from '@/lib/enrichment/ticketmasterClient';

export type EnrichmentInput = {
  encounter_id: string;
  lat: number;
  lon: number;
  timestamp: string;
};

/**
 * Cache-first waterfall: registry → OSM venue cache → Ticketmaster → sports fallback.
 * Never throws; returns partial results on external API failure.
 */
export async function runEventEnrichmentPipeline(
  supabase: SupabaseClient,
  input: EnrichmentInput,
): Promise<EnrichmentPipelineResult> {
  const { encounter_id, lat, lon, timestamp } = input;
  const eventDate = toEventDate(timestamp);
  let degraded = false;
  let venueName: string | null = null;

  // 1. Cache check — spatial venue cache + registry lookup for date
  const cachedVenue = await getVenueFromCache(supabase, lat, lon);
  if (cachedVenue) {
    venueName = cachedVenue.venue_name;
    const cachedEvent = await findRegistryEventByVenueAndDate(
      supabase,
      venueName,
      eventDate,
    );
    if (cachedEvent) {
      await linkEncounterToEvent(supabase, encounter_id, cachedEvent.id);
      return {
        encounter_id,
        event_id: cachedEvent.id,
        venue_name: venueName,
        status: 'cache_hit',
      };
    }
  }

  // 2. Spatial resolution (Overpass / OSM)
  if (!venueName) {
    const resolved = await fetchVenueFromOverpass(lat, lon);
    if (resolved) {
      venueName = resolved;
      await saveVenueToCache(supabase, lat, lon, venueName);
    } else {
      degraded = true;
    }
  }

  if (!venueName) {
    return {
      encounter_id,
      event_id: null,
      venue_name: null,
      status: 'no_match',
      degraded,
    };
  }

  // Re-check registry after venue resolution (another encounter may have populated it)
  const existingEvent = await findRegistryEventByVenueAndDate(
    supabase,
    venueName,
    eventDate,
  );
  if (existingEvent) {
    await linkEncounterToEvent(supabase, encounter_id, existingEvent.id);
    return {
      encounter_id,
      event_id: existingEvent.id,
      venue_name: venueName,
      status: 'cache_hit',
      degraded,
    };
  }

  // 3. Event resolution (Ticketmaster + sports fallback)
  let resolvedEvent = await fetchEventFromTicketmaster(venueName, eventDate);
  if (!resolvedEvent) {
    resolvedEvent = await fetchSportsFallbackEvent(venueName, eventDate);
    if (!resolvedEvent) {
      degraded = true;
      return {
        encounter_id,
        event_id: null,
        venue_name: venueName,
        status: 'venue_only',
        degraded,
      };
    }
  }

  // 4. Registry update + encounter link
  const inserted = await insertRegistryEvent(supabase, resolvedEvent);
  if (!inserted) {
    degraded = true;
    return {
      encounter_id,
      event_id: null,
      venue_name: venueName,
      status: 'venue_only',
      degraded,
    };
  }

  await linkEncounterToEvent(supabase, encounter_id, inserted.id);

  return {
    encounter_id,
    event_id: inserted.id,
    venue_name: venueName,
    status: 'resolved',
    degraded,
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EnrichmentPipelineResult,
  EnrichmentPreviewResult,
  EventsRegistryInsert,
} from '@/types/enrichment-schema';
import { gridCoords, toEventDate } from '@/lib/enrichment/gridCoords';
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

/**
 * Same waterfall as {@link runEventEnrichmentPipeline} but returns planned upserts
 * without writing to Supabase (external API calls still run when cache misses).
 */
export async function previewEventEnrichmentPipeline(
  supabase: SupabaseClient,
  input: EnrichmentInput,
): Promise<EnrichmentPreviewResult> {
  const { encounter_id, lat, lon, timestamp } = input;
  const eventDate = toEventDate(timestamp);
  const grid = gridCoords(lat, lon);
  let degraded = false;
  let venueName: string | null = null;
  let venueCacheHit = false;
  let registryHit = false;
  let wouldUpsertVenue = false;
  let registryRow: EventsRegistryInsert | null = null;

  const cachedVenue = await getVenueFromCache(supabase, lat, lon);
  if (cachedVenue) {
    venueCacheHit = true;
    venueName = cachedVenue.venue_name;
    const cachedEvent = await findRegistryEventByVenueAndDate(
      supabase,
      venueName,
      eventDate,
    );
    if (cachedEvent) {
      registryHit = true;
      return {
        encounter_id,
        event_date: eventDate,
        grid,
        status: 'cache_hit',
        degraded: false,
        would_write: {
          event_venues_cache: null,
          events_registry: null,
          connection_encounters: { event_id: cachedEvent.id },
        },
        existing: { venue_cache_hit: true, registry_hit: true },
      };
    }
  }

  if (!venueName) {
    const resolved = await fetchVenueFromOverpass(lat, lon);
    if (resolved) {
      venueName = resolved;
      wouldUpsertVenue = true;
    } else {
      degraded = true;
    }
  }

  if (!venueName) {
    return {
      encounter_id,
      event_date: eventDate,
      grid,
      status: 'no_match',
      degraded,
      would_write: {
        event_venues_cache: null,
        events_registry: null,
        connection_encounters: null,
      },
      existing: { venue_cache_hit: venueCacheHit, registry_hit: false },
    };
  }

  const existingEvent = await findRegistryEventByVenueAndDate(
    supabase,
    venueName,
    eventDate,
  );
  if (existingEvent) {
    registryHit = true;
    return {
      encounter_id,
      event_date: eventDate,
      grid,
      status: 'cache_hit',
      degraded,
      would_write: {
        event_venues_cache: wouldUpsertVenue
          ? { lat: grid.lat, lon: grid.lon, venue_name: venueName }
          : null,
        events_registry: null,
        connection_encounters: { event_id: existingEvent.id },
      },
      existing: { venue_cache_hit: venueCacheHit, registry_hit: true },
    };
  }

  let resolvedEvent = await fetchEventFromTicketmaster(venueName, eventDate);
  if (!resolvedEvent) {
    resolvedEvent = await fetchSportsFallbackEvent(venueName, eventDate);
    if (!resolvedEvent) {
      degraded = true;
      return {
        encounter_id,
        event_date: eventDate,
        grid,
        status: 'venue_only',
        degraded,
        would_write: {
          event_venues_cache: wouldUpsertVenue
            ? { lat: grid.lat, lon: grid.lon, venue_name: venueName }
            : null,
          events_registry: null,
          connection_encounters: null,
        },
        existing: { venue_cache_hit: venueCacheHit, registry_hit: false },
      };
    }
  }

  registryRow = {
    id: resolvedEvent.id,
    category: resolvedEvent.category,
    title: resolvedEvent.title,
    venue_name: resolvedEvent.venue_name,
    event_date: resolvedEvent.event_date,
    provider: resolvedEvent.provider,
    provider_internal_id: resolvedEvent.provider_internal_id,
  };

  return {
    encounter_id,
    event_date: eventDate,
    grid,
    status: 'resolved',
    degraded,
    would_write: {
      event_venues_cache: wouldUpsertVenue
        ? { lat: grid.lat, lon: grid.lon, venue_name: venueName }
        : null,
      events_registry: registryRow,
      connection_encounters: { event_id: resolvedEvent.id },
    },
    existing: { venue_cache_hit: venueCacheHit, registry_hit: false },
  };
}

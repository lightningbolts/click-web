import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EventVenuesCacheRow,
  EventsRegistryRow,
} from '@/types/enrichment-schema';
import { gridCoords } from '@/lib/enrichment/gridCoords';

export async function getVenueFromCache(
  supabase: SupabaseClient,
  lat: number,
  lon: number,
): Promise<EventVenuesCacheRow | null> {
  const grid = gridCoords(lat, lon);
  const { data, error } = await supabase
    .from('event_venues_cache')
    .select('id, lat, lon, venue_name, created_at')
    .eq('lat', grid.lat)
    .eq('lon', grid.lon)
    .maybeSingle();

  if (error) {
    console.warn('[enrichment] event_venues_cache lookup:', error.message);
    return null;
  }
  return (data as EventVenuesCacheRow | null) ?? null;
}

export async function saveVenueToCache(
  supabase: SupabaseClient,
  lat: number,
  lon: number,
  venueName: string,
): Promise<EventVenuesCacheRow | null> {
  const grid = gridCoords(lat, lon);
  const { data, error } = await supabase
    .from('event_venues_cache')
    .upsert(
      {
        lat: grid.lat,
        lon: grid.lon,
        venue_name: venueName.trim(),
      },
      { onConflict: 'lat,lon' },
    )
    .select('id, lat, lon, venue_name, created_at')
    .maybeSingle();

  if (error) {
    console.warn('[enrichment] event_venues_cache upsert:', error.message);
    return null;
  }
  return (data as EventVenuesCacheRow | null) ?? null;
}

export async function findRegistryEventByVenueAndDate(
  supabase: SupabaseClient,
  venueName: string,
  eventDate: string,
): Promise<EventsRegistryRow | null> {
  const normalized = venueName.trim();
  const { data, error } = await supabase
    .from('events_registry')
    .select('id, category, title, venue_name, event_date, provider, provider_internal_id, created_at')
    .eq('event_date', eventDate)
    .ilike('venue_name', normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[enrichment] events_registry lookup:', error.message);
    return null;
  }
  return (data as EventsRegistryRow | null) ?? null;
}

export async function insertRegistryEvent(
  supabase: SupabaseClient,
  row: Omit<EventsRegistryRow, 'created_at'>,
): Promise<EventsRegistryRow | null> {
  const { data, error } = await supabase
    .from('events_registry')
    .upsert(row, { onConflict: 'id' })
    .select('id, category, title, venue_name, event_date, provider, provider_internal_id, created_at')
    .maybeSingle();

  if (error) {
    console.warn('[enrichment] events_registry upsert:', error.message);
    return null;
  }
  return (data as EventsRegistryRow | null) ?? null;
}

export async function linkEncounterToEvent(
  supabase: SupabaseClient,
  encounterId: string,
  eventId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('connection_encounters')
    .update({ event_id: eventId })
    .eq('id', encounterId);

  if (error) {
    console.warn('[enrichment] connection_encounters update:', error.message);
    return false;
  }
  return true;
}

export async function getRegistryEventById(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventsRegistryRow | null> {
  const { data, error } = await supabase
    .from('events_registry')
    .select('id, category, title, venue_name, event_date, provider, provider_internal_id, created_at')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    console.warn('[enrichment] events_registry by id:', error.message);
    return null;
  }
  return (data as EventsRegistryRow | null) ?? null;
}

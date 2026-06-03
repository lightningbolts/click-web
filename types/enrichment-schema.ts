/**
 * Normalized event enrichment knowledge graph + external API payload shapes.
 * Merge into generated `Database` when you run `supabase gen types`.
 */

export type EventCategory = 'sports' | 'music' | 'conference' | 'generic';

export type EventProvider = 'ticketmaster' | 'osm' | 'sportsdb';

/** Row in `public.events_registry`. */
export interface EventsRegistryRow {
  id: string;
  category: EventCategory;
  title: string;
  venue_name: string;
  event_date: string;
  provider: EventProvider;
  provider_internal_id: string;
  created_at: string;
}

export interface EventsRegistryInsert {
  id: string;
  category: EventCategory;
  title: string;
  venue_name: string;
  event_date: string;
  provider: EventProvider;
  provider_internal_id: string;
  created_at?: string;
}

/** Row in `public.event_venues_cache`. */
export interface EventVenuesCacheRow {
  id: string;
  lat: number;
  lon: number;
  venue_name: string;
  created_at: string;
}

export interface EventVenuesCacheInsert {
  id?: string;
  lat: number;
  lon: number;
  venue_name: string;
  created_at?: string;
}

/** Subset of `connection_encounters` columns used by enrichment + detail resolver. */
export interface ConnectionEncounterEnrichmentRow {
  id: string;
  connection_id: string;
  encountered_at: string;
  location_name: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  event_id: string | null;
  weather_snapshot: Record<string, unknown> | null;
  context_tags: string[] | null;
}

/** Overpass API JSON response (subset). */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version?: number;
  generator?: string;
  elements?: OverpassElement[];
}

/** Ticketmaster Discovery API (subset). */
export interface TicketmasterClassification {
  segment?: { id?: string; name?: string };
  genre?: { id?: string; name?: string };
  subGenre?: { id?: string; name?: string };
}

export interface TicketmasterVenue {
  id?: string;
  name?: string;
  city?: { name?: string };
}

export interface TicketmasterEvent {
  id: string;
  name: string;
  url?: string;
  dates?: {
    start?: {
      localDate?: string;
      localTime?: string;
      dateTime?: string;
    };
  };
  classifications?: TicketmasterClassification[];
  _embedded?: {
    venues?: TicketmasterVenue[];
  };
}

export interface TicketmasterDiscoveryResponse {
  _embedded?: {
    events?: TicketmasterEvent[];
  };
  page?: {
    size?: number;
    totalElements?: number;
    totalPages?: number;
    number?: number;
  };
}

/** On-demand dynamic payloads (not persisted). */
export interface SportsBoxScorePayload {
  home_score: number;
  away_score: number;
  status: string;
  highlights: string;
}

export interface MusicSetlistPayload {
  artist: string;
  venue: string;
  date: string;
  tracks: string[];
}

export type EncounterDynamicContext =
  | { category: 'sports'; box_score: SportsBoxScorePayload }
  | { category: 'music'; setlist: MusicSetlistPayload }
  | { category: 'conference' | 'generic'; note: string };

export interface EncounterDetailsResponse {
  encounter: ConnectionEncounterEnrichmentRow;
  event: EventsRegistryRow | null;
  venue_cache: Pick<EventVenuesCacheRow, 'venue_name' | 'lat' | 'lon'> | null;
  dynamic: EncounterDynamicContext | null;
  enrichment_status: 'linked' | 'venue_only' | 'base_only';
}

export type EnrichmentPipelineResult = {
  encounter_id: string;
  event_id: string | null;
  venue_name: string | null;
  status: 'cache_hit' | 'resolved' | 'venue_only' | 'no_match';
  degraded?: boolean;
};

/** Read-only preview of DB writes the pipeline would perform (no mutations). */
export type EnrichmentPreviewResult = {
  encounter_id: string;
  event_date: string;
  grid: { lat: number; lon: number };
  status: EnrichmentPipelineResult['status'];
  degraded: boolean;
  would_write: {
    event_venues_cache: EventVenuesCacheInsert | null;
    events_registry: EventsRegistryInsert | null;
    connection_encounters: { event_id: string } | null;
  };
  existing: {
    venue_cache_hit: boolean;
    registry_hit: boolean;
  };
};

/** Optional: merge into generated `Database['public']['Tables']`. */
export type EnrichmentPublicTables = {
  events_registry: {
    Row: EventsRegistryRow;
    Insert: EventsRegistryInsert;
    Update: Partial<EventsRegistryInsert>;
    Relationships: [];
  };
  event_venues_cache: {
    Row: EventVenuesCacheRow;
    Insert: EventVenuesCacheInsert;
    Update: Partial<EventVenuesCacheInsert>;
    Relationships: [];
  };
};

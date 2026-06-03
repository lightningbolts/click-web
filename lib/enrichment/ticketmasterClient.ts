import type {
  EventCategory,
  TicketmasterDiscoveryResponse,
  TicketmasterEvent,
} from '@/types/enrichment-schema';
import { fetchWithTimeout, safeExternalFetch } from '@/lib/enrichment/fetchWithTimeout';
import { slugify } from '@/lib/enrichment/gridCoords';

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

function inferCategory(event: TicketmasterEvent): EventCategory {
  const segments =
    event.classifications?.map((c) => c.segment?.name?.toLowerCase() ?? '') ?? [];
  if (segments.some((s) => s.includes('sport'))) return 'sports';
  if (segments.some((s) => s.includes('music'))) return 'music';
  if (segments.some((s) => s.includes('arts') || s.includes('misc'))) return 'music';
  if (segments.some((s) => s.includes('conference') || s.includes('community'))) {
    return 'conference';
  }
  return 'generic';
}

function pickVenueName(event: TicketmasterEvent, keyword: string): string {
  const embedded = event._embedded?.venues?.[0]?.name?.trim();
  return embedded && embedded.length > 0 ? embedded : keyword;
}

export type ResolvedRegistryEvent = {
  id: string;
  category: EventCategory;
  title: string;
  venue_name: string;
  event_date: string;
  provider: 'ticketmaster' | 'sportsdb';
  provider_internal_id: string;
};

/**
 * Query Ticketmaster Discovery API (free tier) by venue keyword + local date.
 */
export async function fetchEventFromTicketmaster(
  venueKeyword: string,
  eventDate: string,
): Promise<ResolvedRegistryEvent | null> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[enrichment] TICKETMASTER_API_KEY not configured');
    return null;
  }

  return safeExternalFetch('ticketmaster', async () => {
    const start = `${eventDate}T00:00:00Z`;
    const end = `${eventDate}T23:59:59Z`;
    const params = new URLSearchParams({
      apikey: apiKey,
      keyword: venueKeyword,
      startDateTime: start,
      endDateTime: end,
      size: '5',
      sort: 'date,asc',
    });

    const res = await fetchWithTimeout(`${TM_BASE}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (res.status === 429) {
      throw new Error('Ticketmaster rate limit (429)');
    }
    if (!res.ok) {
      throw new Error(`Ticketmaster HTTP ${res.status}`);
    }

    const json = (await res.json()) as TicketmasterDiscoveryResponse;
    const events = json._embedded?.events ?? [];
    if (events.length === 0) return null;

    const event = events[0];
    const localDate = event.dates?.start?.localDate ?? eventDate;
    const category = inferCategory(event);
    const venueName = pickVenueName(event, venueKeyword);

    return {
      id: `tm_${event.id}`,
      category,
      title: event.name.trim(),
      venue_name: venueName,
      event_date: localDate,
      provider: 'ticketmaster',
      provider_internal_id: event.id,
    };
  });
}

/**
 * Sports-oriented fallback when Ticketmaster returns nothing but venue looks athletic.
 */
export async function fetchSportsFallbackEvent(
  venueName: string,
  eventDate: string,
): Promise<ResolvedRegistryEvent | null> {
  const lower = venueName.toLowerCase();
  const looksSports =
    /park|stadium|arena|field|coliseum|ballpark|center|centre|dome/.test(lower);
  if (!looksSports) return null;

  return safeExternalFetch('sportsdb-fallback', async () => {
    const slug = slugify(venueName);
    const parts = eventDate.split('-');
    const year = parts[0] ?? '2026';
    const id = `sportsdb_${slug}_${year}`;

    return {
      id,
      category: 'sports' as const,
      title: `Game at ${venueName}`,
      venue_name: venueName,
      event_date: eventDate,
      provider: 'sportsdb' as const,
      provider_internal_id: slug,
    };
  });
}

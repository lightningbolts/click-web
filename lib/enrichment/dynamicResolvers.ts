import type {
  EncounterDynamicContext,
  EventsRegistryRow,
  MusicSetlistPayload,
  SportsBoxScorePayload,
} from '@/types/enrichment-schema';
import { safeExternalFetch } from '@/lib/enrichment/fetchWithTimeout';

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Mock on-demand sports box score (SportsDB-style) keyed by event title + date.
 */
export async function fetchSportsBoxScore(
  event: EventsRegistryRow,
): Promise<SportsBoxScorePayload | null> {
  return safeExternalFetch('sports-box-score', async () => {
    const seed = hashSeed(`${event.title}|${event.event_date}|${event.venue_name}`);
    const home = (seed % 7) + 2;
    const away = ((seed >> 3) % 7) + 1;
    const statuses = ['Final', 'Final/OT', 'In Progress', 'Scheduled'] as const;
    const highlights = [
      'Walk-off win in the 11th',
      'Late rally seals the victory',
      'Pitching duel ends in extras',
      'Dominant performance in the fourth quarter',
    ];

    return {
      home_score: home,
      away_score: away,
      status: statuses[seed % statuses.length],
      highlights: highlights[seed % highlights.length],
    };
  });
}

/**
 * Mock on-demand setlist (Setlist.fm-style) for music events.
 */
export async function fetchMusicSetlist(
  event: EventsRegistryRow,
): Promise<MusicSetlistPayload | null> {
  return safeExternalFetch('music-setlist', async () => {
    const artist = event.title.split(' at ')[0]?.trim() || event.title;
    const seed = hashSeed(`${artist}|${event.venue_name}|${event.event_date}`);
    const catalog = [
      'Opening Act',
      'Crowd Favorite',
      'Deep Cut',
      'Encore Hit',
      'Finale',
      'Acoustic Interlude',
      'New Single',
    ];
    const count = 4 + (seed % 3);
    const tracks: string[] = [];
    for (let i = 0; i < count; i++) {
      tracks.push(`${catalog[(seed + i) % catalog.length]} (${i + 1})`);
    }

    return {
      artist,
      venue: event.venue_name,
      date: event.event_date,
      tracks,
    };
  });
}

export async function resolveDynamicContext(
  event: EventsRegistryRow,
): Promise<EncounterDynamicContext | null> {
  if (event.category === 'sports') {
    const box_score = await fetchSportsBoxScore(event);
    if (!box_score) return null;
    return { category: 'sports', box_score };
  }

  if (event.category === 'music') {
    const setlist = await fetchMusicSetlist(event);
    if (!setlist) return null;
    return { category: 'music', setlist };
  }

  return {
    category: event.category,
    note: `Event context available for ${event.title} at ${event.venue_name}.`,
  };
}

import type { OverpassResponse } from '@/types/enrichment-schema';
import { fetchWithTimeout, safeExternalFetch } from '@/lib/enrichment/fetchWithTimeout';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const AMENITY_PATTERN = 'theatre|stadium';
const BUILDING_TAG = 'building';

function pickVenueName(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  const candidates = [
    tags.name,
    tags['addr:housename'],
    tags['addr:place'],
    tags.operator,
    tags.brand,
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (t && t.length > 1) return t;
  }
  return null;
}

function buildOverpassQuery(lat: number, lon: number): string {
  return `
[out:json][timeout:4];
(
  nwr(around:150,${lat},${lon})["amenity"~"${AMENITY_PATTERN}"];
  nwr(around:150,${lat},${lon})["${BUILDING_TAG}"];
);
out tags;
`.trim();
}

/**
 * Resolve nearest venue name within 150 m via Overpass (OSM).
 */
export async function fetchVenueFromOverpass(
  lat: number,
  lon: number,
): Promise<string | null> {
  return safeExternalFetch('overpass', async () => {
    const query = buildOverpassQuery(lat, lon);
    const res = await fetchWithTimeout(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status}`);
    }

    const json = (await res.json()) as OverpassResponse;
    const elements = json.elements ?? [];

    for (const el of elements) {
      const name = pickVenueName(el.tags);
      if (name) return name;
    }

    return null;
  });
}

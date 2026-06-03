import type { OverpassResponse } from '@/types/enrichment-schema';
import { fetchWithTimeout, safeExternalFetch } from '@/lib/enrichment/fetchWithTimeout';

/** Public mirrors — tried in order; kumi is often less congested than overpass-api.de */
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
] as const;

const OVERPASS_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';

const OVERPASS_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': OVERPASS_USER_AGENT,
} as const;

const OVERPASS_TIMEOUT_MS = Number.parseInt(process.env.OVERPASS_TIMEOUT_MS ?? '20000', 10);
const OVERPASS_RETRIES = Number.parseInt(process.env.OVERPASS_RETRIES ?? '2', 10);
const OVERPASS_QUERY_TIMEOUT_SEC = Math.min(
  60,
  Math.max(10, Math.ceil(OVERPASS_TIMEOUT_MS / 1000) - 2),
);

const AMENITY_PATTERN =
  'theatre|stadium|university|library|cafe|restaurant|arts_centre|conference_centre|events_venue';
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
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];
(
  nwr(around:150,${lat},${lon})["name"]["amenity"~"${AMENITY_PATTERN}"];
  nwr(around:150,${lat},${lon})["name"]["${BUILDING_TAG}"];
);
out tags;
`.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryOverpassEndpoint(
  endpoint: string,
  lat: number,
  lon: number,
): Promise<string | null> {
  const query = buildOverpassQuery(lat, lon);
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: OVERPASS_HEADERS,
      body: new URLSearchParams({ data: query }).toString(),
      cache: 'no-store',
    },
    OVERPASS_TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status} (${endpoint})`);
  }

  const json = (await res.json()) as OverpassResponse;
  const elements = json.elements ?? [];

  for (const el of elements) {
    const name = pickVenueName(el.tags);
    if (name) return name;
  }

  return null;
}

/**
 * Resolve nearest venue name within 150 m via Overpass (OSM).
 * Retries across mirrors with backoff when the public API is slow.
 */
export async function fetchVenueFromOverpass(
  lat: number,
  lon: number,
): Promise<string | null> {
  return safeExternalFetch('overpass', async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= OVERPASS_RETRIES; attempt++) {
      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          return await queryOverpassEndpoint(endpoint, lat, lon);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (attempt < OVERPASS_RETRIES) {
        await sleep(1500 * (attempt + 1));
      }
    }

    throw lastError ?? new Error('Overpass unavailable');
  });
}

const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
export const DISPLAY_LOCATION_FALLBACK = 'A new city';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function normalizeClientNoiseLevelString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeElevationCategoryString(value: unknown): string | null {
  return normalizeClientNoiseLevelString(value);
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function isEncounterRateLimitError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false;
  const combined = [
    err.message ?? '',
    err.details ?? '',
    err.hint ?? '',
  ].join(' ');
  return combined.includes('encounter_rate_limit_3h');
}

function extractDisplayLocation(semanticLocation: Record<string, unknown>): string {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return DISPLAY_LOCATION_FALLBACK;
  const city = firstNonEmptyString([
    address.city,
    address.town,
    address.village,
    address.hamlet,
  ]);
  if (!city) return DISPLAY_LOCATION_FALLBACK;
  const state = firstNonEmptyString([address.state]);
  return state ? `${city}, ${state}` : city;
}

// Intentionally diverges from lib/server/proximity's extractSpecificLocationName
// (this variant prefers the top-level `name` and has no house-number composition).
function extractSpecificLocationName(semanticLocation: Record<string, unknown>): string | null {
  const topLevelName = firstNonEmptyString([semanticLocation.name]);
  if (topLevelName) return topLevelName;

  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return null;

  return firstNonEmptyString([
    address.amenity,
    address.building,
    address.residential,
    address.road,
  ]);
}

export async function fetchNominatimReverseGeocode(lat: number, lon: number): Promise<{
  semanticLocation: Record<string, unknown> | null;
  displayLocation: string;
  specificLocationName: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_REVERSE_TIMEOUT_MS);
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
    if (!response.ok) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    return {
      semanticLocation: payload,
      displayLocation: extractDisplayLocation(payload),
      specificLocationName: extractSpecificLocationName(payload),
    };
  } catch {
    return {
      semanticLocation: null,
      displayLocation: DISPLAY_LOCATION_FALLBACK,
      specificLocationName: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Haversine distance in meters between two lat/lon coordinate pairs.
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Compute the Proximity Confidence Score (0–100).
 *
 * | Signal                          | Points |
 * |─────────────────────────────────|────────|
 * | NFC connection method           | +50    |
 * | GPS distance < 10m              | +30    |
 * | GPS distance 10–50m             | +15    |
 * | GPS distance 50–100m            | +5     |
 * | GPS distance > 100m             | −40    |
 * | QR token age < 30s              | +10    |
 * | QR token age 30–60s             | +5     |
 * | QR token age > 60s              |  0     |
 * | Same WiFi BSSID                 | +15    |
 */
export function computeProximityScore(params: {
  connectionMethod: string;
  gpsDistanceMeters: number | null;
  tokenAgeSeconds: number | null;
  sharedBssid: boolean;
  gpsAvailable: boolean;
}): { score: number; signals: Record<string, unknown> } {
  const { connectionMethod, gpsDistanceMeters, tokenAgeSeconds, sharedBssid, gpsAvailable } = params;

  let score = 0;

  // Connection method baseline
  if (connectionMethod === 'nfc' || connectionMethod === 'proximity') {
    score += 50;
  }

  // GPS distance scoring
  if (gpsDistanceMeters !== null && gpsAvailable) {
    if (gpsDistanceMeters < 10) score += 30;
    else if (gpsDistanceMeters <= 50) score += 15;
    else if (gpsDistanceMeters <= 100) score += 5;
    else score -= 40;
  }

  // QR token age scoring
  if (tokenAgeSeconds !== null) {
    if (tokenAgeSeconds < 30) score += 10;
    else if (tokenAgeSeconds <= 60) score += 5;
    // > 60s = 0 points
  }

  // WiFi BSSID match
  if (sharedBssid) {
    score += 15;
  }

  // Clamp to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const signals: Record<string, unknown> = {
    gps_distance_meters: gpsDistanceMeters !== null ? Math.round(gpsDistanceMeters * 10) / 10 : null,
    token_age_seconds: tokenAgeSeconds !== null ? Math.round(tokenAgeSeconds) : null,
    shared_bssid: sharedBssid,
    connection_method: connectionMethod,
    gps_available: gpsAvailable,
  };

  return { score, signals };
}

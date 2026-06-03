import { parseSemanticLocation } from '@/lib/enrichment/spatialZoning';

function trimOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** City / neighbourhood-only labels — not useful as event venue names */
const GENERIC_VENUE_PATTERN =
  /^(seattle|washington|university district|u-district|west campus|central campus|north campus|south campus|usa|united states)$/i;

function isUsableVenueName(name: string): boolean {
  if (name.length < 2 || name.length > 120) return false;
  if (GENERIC_VENUE_PATTERN.test(name)) return false;
  if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) return false;
  return true;
}

/**
 * Extracts a POI / building name from Nominatim `semantic_location` jsonb.
 */
export function extractVenueNameFromSemanticLocation(semanticLocation: unknown): string | null {
  let obj: unknown = semanticLocation;
  if (typeof semanticLocation === 'string') {
    const t = semanticLocation.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const root = obj as Record<string, unknown>;
  const rootName = trimOrEmpty(root.name);
  if (isUsableVenueName(rootName)) return rootName;

  const addr =
    root.address && typeof root.address === 'object' && !Array.isArray(root.address)
      ? (root.address as Record<string, unknown>)
      : {};

  const addrCandidates = [
    trimOrEmpty(addr.amenity),
    trimOrEmpty(addr.building),
    trimOrEmpty(addr.shop),
    trimOrEmpty(addr.tourism),
    trimOrEmpty(addr.leisure),
    trimOrEmpty(addr.house_name),
  ];

  for (const c of addrCandidates) {
    if (c && c !== 'yes' && isUsableVenueName(c)) return c;
  }

  const parsed = parseSemanticLocation(semanticLocation);
  if (parsed.neighbourhood && isUsableVenueName(parsed.neighbourhood)) {
    return parsed.neighbourhood;
  }

  return null;
}

export type EncounterVenueInput = {
  location_name?: string | null;
  semantic_location?: unknown;
};

/**
 * Resolves venue from encounter row data (no external APIs).
 * Prefer explicit `location_name`, then Nominatim `name` / address tags.
 */
export function resolveVenueFromEncounter(input: EncounterVenueInput): string | null {
  const locationName = trimOrEmpty(input.location_name);
  if (isUsableVenueName(locationName)) return locationName;

  return extractVenueNameFromSemanticLocation(input.semantic_location);
}

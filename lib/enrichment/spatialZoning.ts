export type ParsedSemanticLocation = {
  neighbourhood?: string;
  suburb?: string;
  osmClass?: string;
  osmType?: string;
  amenity?: string;
  building?: string;
  highway?: string;
  railway?: string;
  publicTransport?: string;
};

function trimOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function parseSemanticLocation(semanticLocation: unknown): ParsedSemanticLocation {
  let obj: unknown = semanticLocation;
  if (typeof semanticLocation === 'string') {
    const t = semanticLocation.trim();
    if (!t) return {};
    try {
      obj = JSON.parse(t) as unknown;
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};

  const root = obj as Record<string, unknown>;
  const addr =
    root.address && typeof root.address === 'object' && !Array.isArray(root.address)
      ? (root.address as Record<string, unknown>)
      : {};

  const neighbourhood =
    trimOrEmpty(addr.neighbourhood) ||
    trimOrEmpty(addr.neighborhood) ||
    undefined;
  const suburb =
    trimOrEmpty(addr.suburb) ||
    trimOrEmpty(addr.city_district) ||
    undefined;

  return {
    neighbourhood,
    suburb,
    osmClass: trimOrEmpty(root.class) || undefined,
    osmType: trimOrEmpty(root.type) || undefined,
    amenity:
      trimOrEmpty(addr.amenity) ||
      trimOrEmpty(root.amenity) ||
      (root.class === 'amenity' ? trimOrEmpty(root.type) : '') ||
      undefined,
    building: trimOrEmpty(addr.building) || trimOrEmpty(root.building) || undefined,
    highway: trimOrEmpty(addr.road) || (root.class === 'highway' ? trimOrEmpty(root.type) : '') || undefined,
    railway: root.class === 'railway' ? trimOrEmpty(root.type) : undefined,
    publicTransport:
      root.class === 'public_transport' ? trimOrEmpty(root.type) : undefined,
  };
}

export type ZoningCategory =
  | 'Third Place / Social Space'
  | 'Institutional / Study Space'
  | 'Transitional Transit Zone'
  | 'Residential / Dorm'
  | 'Commercial / Retail'
  | 'Outdoor / Green Space'
  | 'Mixed Urban';

const CAFE_AMENITIES = new Set([
  'cafe',
  'coffee_shop',
  'restaurant',
  'fast_food',
  'bar',
  'pub',
  'biergarten',
  'food_court',
]);

const INSTITUTIONAL = new Set([
  'library',
  'university',
  'college',
  'school',
  'research_institute',
]);

const TRANSIT = new Set([
  'bus_stop',
  'bus_station',
  'tram_stop',
  'subway_entrance',
  'station',
  'halt',
]);

const RESIDENTIAL_HINTS = new Set([
  'residential',
  'dormitory',
  'apartments',
  'student_accommodation',
  'house',
  'yes',
]);

const NIGHTLIFE = new Set(['bar', 'pub', 'nightclub', 'biergarten']);

export function classifyZoningCategory(parsed: ParsedSemanticLocation): ZoningCategory {
  const amenity = (parsed.amenity ?? parsed.osmType ?? '').toLowerCase();
  const building = (parsed.building ?? '').toLowerCase();
  const osmClass = (parsed.osmClass ?? '').toLowerCase();
  const osmType = (parsed.osmType ?? '').toLowerCase();

  if (CAFE_AMENITIES.has(amenity) || CAFE_AMENITIES.has(osmType)) {
    return 'Third Place / Social Space';
  }
  if (INSTITUTIONAL.has(amenity) || INSTITUTIONAL.has(osmType) || osmClass === 'amenity' && INSTITUTIONAL.has(osmType)) {
    return 'Institutional / Study Space';
  }
  if (
    osmClass === 'highway' ||
    TRANSIT.has(osmType) ||
    TRANSIT.has(amenity) ||
    parsed.railway ||
    parsed.publicTransport ||
    osmClass === 'public_transport'
  ) {
    return 'Transitional Transit Zone';
  }
  if (
    RESIDENTIAL_HINTS.has(building) ||
    RESIDENTIAL_HINTS.has(osmType) ||
    osmClass === 'building' && RESIDENTIAL_HINTS.has(osmType)
  ) {
    return 'Residential / Dorm';
  }
  if (osmClass === 'leisure' || osmClass === 'natural' || osmType === 'park') {
    return 'Outdoor / Green Space';
  }
  if (osmClass === 'shop' || osmClass === 'commercial') {
    return 'Commercial / Retail';
  }
  return 'Mixed Urban';
}

export function formatZoningProfile(
  parsed: ParsedSemanticLocation,
  category: ZoningCategory,
): string {
  const placeParts = [parsed.neighbourhood, parsed.suburb].filter(Boolean);
  const place = placeParts.length > 0 ? placeParts.join(' · ') : null;
  return place ? `${place} — ${category}` : category;
}

export type SpaceProbability = {
  indoor: boolean;
  elevated: boolean;
};

/** Aligns with proximity bind + mobile UI (lux < 15 → dimly lit). */
const LUX_DIM_INDOOR = 15;
const LUX_MODERATE_INDOOR = 150;
const LUX_BRIGHT_OUTDOOR = 10_000;

const INDOOR_ZONING = new Set<ZoningCategory>([
  'Residential / Dorm',
  'Institutional / Study Space',
  'Third Place / Social Space',
  'Commercial / Retail',
]);

const OUTDOOR_ZONING = new Set<ZoningCategory>(['Outdoor / Green Space']);

export type SpaceProbabilityInput = {
  elevation_category?: string | null;
  lux_level?: number | null;
  exact_barometric_elevation_m?: number | null;
  /** Height above local terrain (m). Prefer for elevated/high-rise inference. */
  relative_altitude_m?: number | null;
  noise_level?: string | null;
  exact_noise_level_db?: number | null;
  zoningCategory: ZoningCategory;
  parsed: ParsedSemanticLocation;
  /** When true (e.g. solar Nighttime), indoor bias for built-environment zones */
  likelyNighttime?: boolean;
};

/**
 * Multi-signal indoor inference. Lux alone is insufficient: many rows lack lux,
 * and lit interiors often exceed 100 lux. Zoning + elevation + noise fill gaps.
 */
export function scoreIndoorLikelihood(input: SpaceProbabilityInput): number {
  let score = 0;
  const elev = (input.elevation_category ?? '').toUpperCase();
  const lux = input.lux_level;
  const noise = (input.noise_level ?? '').toUpperCase();
  const noiseDb = input.exact_noise_level_db;
  const { zoningCategory } = input;

  if (typeof lux === 'number' && Number.isFinite(lux)) {
    if (lux < LUX_DIM_INDOOR) score += 3;
    else if (lux < LUX_MODERATE_INDOOR) score += 2;
    else if (lux < 1000) score += 1;
    if (lux >= LUX_BRIGHT_OUTDOOR) score -= 4;
  } else if (INDOOR_ZONING.has(zoningCategory)) {
    // No lux telemetry — lean on place type (common for historical rows)
    score += 2;
  }

  if (INDOOR_ZONING.has(zoningCategory)) score += 2;
  if (OUTDOOR_ZONING.has(zoningCategory)) score -= 4;
  if (zoningCategory === 'Transitional Transit Zone') score -= 1;

  if (elev === 'BELOW_GROUND' || elev === 'HIGH_RISE' || elev === 'ELEVATED') {
    score += 2;
  }

  if (noise === 'VERY_QUIET' || noise === 'QUIET') score += 1;
  if (typeof noiseDb === 'number' && Number.isFinite(noiseDb) && noiseDb < 48) {
    score += 1;
  }
  if (noise === 'LOUD' || noise === 'VERY_LOUD') score -= 1;

  const building = (input.parsed.building ?? '').toLowerCase();
  if (
    building === 'dormitory' ||
    building === 'apartments' ||
    building === 'residential' ||
    building === 'university'
  ) {
    score += 1;
  }

  if (input.likelyNighttime && INDOOR_ZONING.has(zoningCategory)) {
    score += 1;
  }

  return score;
}

export function evaluateSpaceProbability(input: SpaceProbabilityInput): SpaceProbability {
  const elev = (input.elevation_category ?? '').toUpperCase();
  const lux = input.lux_level;
  const isHighRise = elev === 'HIGH_RISE' || elev === 'ELEVATED';
  const dimLux =
    typeof lux === 'number' && Number.isFinite(lux) && lux < LUX_MODERATE_INDOOR;

  const groundCommercial =
    input.zoningCategory === 'Third Place / Social Space' ||
    input.zoningCategory === 'Commercial / Retail';

  const elevatedIndoor = isHighRise && dimLux && groundCommercial;

  const agl =
    typeof input.relative_altitude_m === 'number' && Number.isFinite(input.relative_altitude_m)
      ? input.relative_altitude_m
      : null;
  const highAgl = agl != null && agl >= 20;

  const indoorScore = scoreIndoorLikelihood(input);
  const indoor = indoorScore >= 2;

  return {
    indoor,
    elevated: elevatedIndoor || (isHighRise && highAgl),
  };
}

export function isNightlifeVenue(parsed: ParsedSemanticLocation): boolean {
  const amenity = (parsed.amenity ?? parsed.osmType ?? '').toLowerCase();
  return NIGHTLIFE.has(amenity);
}

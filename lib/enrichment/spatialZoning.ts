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

export function evaluateSpaceProbability(input: {
  elevation_category?: string | null;
  lux_level?: number | null;
  exact_barometric_elevation_m?: number | null;
  zoningCategory: ZoningCategory;
  parsed: ParsedSemanticLocation;
}): SpaceProbability {
  const elev = (input.elevation_category ?? '').toUpperCase();
  const lux = input.lux_level;
  const isHighRise = elev === 'HIGH_RISE' || elev === 'ELEVATED';
  const dimIndoor = typeof lux === 'number' && Number.isFinite(lux) && lux < 100;

  const groundCommercial =
    input.zoningCategory === 'Third Place / Social Space' ||
    input.zoningCategory === 'Commercial / Retail';

  const elevatedIndoor = isHighRise && dimIndoor && groundCommercial;

  const baro = input.exact_barometric_elevation_m;
  const highBaro = typeof baro === 'number' && Number.isFinite(baro) && baro >= 20;

  return {
    indoor: dimIndoor || elevatedIndoor,
    elevated: elevatedIndoor || (isHighRise && highBaro),
  };
}

export function isNightlifeVenue(parsed: ParsedSemanticLocation): boolean {
  const amenity = (parsed.amenity ?? parsed.osmType ?? '').toLowerCase();
  return NIGHTLIFE.has(amenity);
}

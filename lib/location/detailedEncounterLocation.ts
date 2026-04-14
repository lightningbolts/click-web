/**
 * Formats encounter place labels to match the mobile app:
 * [location_name] • [neighbourhood], [display_location]
 * with safe fallbacks when semantic_location or neighbourhood is missing.
 */

function trimOrEmpty(s: string | null | undefined): string {
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * Reads `address.neighbourhood` from `connection_encounters.semantic_location`
 * (jsonb object or stringified JSON).
 */
export function parseSemanticLocationNeighbourhood(semanticLocation: unknown): string | undefined {
  let obj: unknown = semanticLocation;
  if (typeof semanticLocation === 'string') {
    const t = semanticLocation.trim();
    if (!t) return undefined;
    try {
      obj = JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const addr = (obj as { address?: unknown }).address;
  if (!addr || typeof addr !== 'object' || Array.isArray(addr)) return undefined;
  const nbh = (addr as { neighbourhood?: unknown }).neighbourhood;
  if (typeof nbh === 'string') {
    const n = nbh.trim();
    return n.length > 0 ? n : undefined;
  }
  return undefined;
}

export type DetailedEncounterLocationInput = {
  locationName?: string | null;
  displayLocation?: string | null;
  /** `connection_encounters.semantic_location` — jsonb or stringified JSON */
  semanticLocation?: unknown;
};

/**
 * Returns a single display line, or undefined when no usable place parts exist.
 */
export function formatDetailedEncounterLocation(input: DetailedEncounterLocationInput): string | undefined {
  const ln = trimOrEmpty(input.locationName);
  const dn = trimOrEmpty(input.displayLocation);
  const nbh = parseSemanticLocationNeighbourhood(input.semanticLocation);

  if (ln && nbh && dn) {
    return `${ln} • ${nbh}, ${dn}`;
  }
  if (ln && nbh) {
    return `${ln} • ${nbh}`;
  }
  if (ln && dn) {
    return ln !== dn ? `${ln} • ${dn}` : ln;
  }
  if (dn && nbh) {
    return `${nbh}, ${dn}`;
  }
  if (ln) return ln;
  if (dn) return dn;
  if (nbh) return nbh;
  return undefined;
}

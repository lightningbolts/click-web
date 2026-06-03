/** Round WGS84 coordinates to 4 decimal places (~11 m) for grid cache keys. */
export function roundCoord(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function gridCoords(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: roundCoord(lat),
    lon: roundCoord(lon),
  };
}

export function toEventDate(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

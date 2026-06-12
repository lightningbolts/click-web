/** Raw encounter coordinate retained in the database (lossless telemetry). */
export type ConnectionEncounterCoordinate = {
  connectionId: string;
  gpsLat: number;
  gpsLon: number;
  encounteredAt?: string;
};

/** Client-side map node derived from grouped raw encounters. */
export type VerifiedConnectionMapNode = {
  connectionId: string;
  latitude: number;
  longitude: number;
  /** Number of distinct raw GPS points snapped into this node. */
  participantCount: number;
  /** True when multiple raw coordinates were centroid-snapped for display. */
  isVerifiedHandshake: boolean;
  encounteredAt?: string;
};

export function isValidGpsCoordinate(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
}

export function geographicCentroid(
  points: ReadonlyArray<{ latitude: number; longitude: number }>,
): { latitude: number; longitude: number } | null {
  if (points.length === 0) return null;
  const latitude = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const longitude = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/**
 * Groups raw `connection_encounters` by `connection_id` and computes display centroids
 * strictly in client memory — raw rows in the database are never averaged server-side.
 */
export function clusterConnectionEncountersForMap(
  encounters: ReadonlyArray<ConnectionEncounterCoordinate>,
): VerifiedConnectionMapNode[] {
  const byConnection = new Map<string, ConnectionEncounterCoordinate[]>();

  for (const encounter of encounters) {
    if (!isValidGpsCoordinate(encounter.gpsLat, encounter.gpsLon)) continue;
    const key = encounter.connectionId.trim();
    if (!key) continue;
    const bucket = byConnection.get(key);
    if (bucket) {
      bucket.push(encounter);
    } else {
      byConnection.set(key, [encounter]);
    }
  }

  const nodes: VerifiedConnectionMapNode[] = [];

  for (const [connectionId, group] of byConnection) {
    const coords = group.map((e) => ({ latitude: e.gpsLat, longitude: e.gpsLon }));
    const centroid = geographicCentroid(coords);
    if (!centroid) continue;

    const latestEncounterAt = group
      .map((e) => e.encounteredAt)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .sort()
      .at(-1);

    nodes.push({
      connectionId,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      participantCount: coords.length,
      isVerifiedHandshake: coords.length > 1,
      encounteredAt: latestEncounterAt,
    });
  }

  return nodes.sort((a, b) => {
    const ta = a.encounteredAt ? Date.parse(a.encounteredAt) : 0;
    const tb = b.encounteredAt ? Date.parse(b.encounteredAt) : 0;
    return tb - ta;
  });
}

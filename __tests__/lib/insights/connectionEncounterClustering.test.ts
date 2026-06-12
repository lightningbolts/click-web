import {
  clusterConnectionEncountersForMap,
  type ConnectionEncounterCoordinate,
} from '@/lib/insights/connectionEncounterClustering';

describe('connectionEncounterClustering', () => {
  const enc = (
    connectionId: string,
    gpsLat: number,
    gpsLon: number,
    encounteredAt?: string,
  ): ConnectionEncounterCoordinate => ({
    connectionId,
    gpsLat,
    gpsLon,
    encounteredAt,
  });

  it('groups by connection_id and centroid-snaps multi-user handshakes client-side', () => {
    const nodes = clusterConnectionEncountersForMap([
      enc('conn-a', 47.6062, -122.3321),
      enc('conn-a', 47.60625, -122.33215),
      enc('conn-b', 47.61, -122.34),
    ]);

    expect(nodes).toHaveLength(2);

    const verified = nodes.find((n) => n.connectionId === 'conn-a');
    expect(verified).toBeDefined();
    expect(verified!.isVerifiedHandshake).toBe(true);
    expect(verified!.participantCount).toBe(2);
    expect(verified!.latitude).toBeCloseTo(47.606225, 5);
    expect(verified!.longitude).toBeCloseTo(-122.332125, 5);

    const single = nodes.find((n) => n.connectionId === 'conn-b');
    expect(single).toBeDefined();
    expect(single!.isVerifiedHandshake).toBe(false);
    expect(single!.participantCount).toBe(1);
  });

  it('skips invalid GPS without dropping valid rows', () => {
    const nodes = clusterConnectionEncountersForMap([
      enc('conn-a', 0, 0),
      enc('conn-a', Number.NaN, -122),
      enc('conn-b', 47.61, -122.34),
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].connectionId).toBe('conn-b');
  });

  it('preserves distinct connection_ids as separate nodes', () => {
    const nodes = clusterConnectionEncountersForMap([
      enc('c1', 47.6, -122.3),
      enc('c2', 47.601, -122.301),
    ]);
    expect(nodes.map((n) => n.connectionId).sort()).toEqual(['c1', 'c2']);
  });
});

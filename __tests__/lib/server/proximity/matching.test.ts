import {
  bfsComponent,
  buildUserAdjacency,
  hasProximityPeerEvidence,
  metersToLatLonDelta,
  peerEvidenceTokens,
  PENDING_CANDIDATE_BBOX_RADIUS_M,
  PENDING_CANDIDATE_MAX_ROWS,
  pendingCandidateBBox,
  PROXIMITY_HOST_SELECTION_MAX_MEMBERS,
  PROXIMITY_MATCH_MAX_M,
  sharedOverlappingPeerTokens,
  simultaneousTapEvidenceBetweenRows,
  tokenEvidenceBetweenRows,
  type HandshakeRowLite,
} from '@/lib/server/proximity/matching';

function row(
  userId: string,
  myToken: string,
  heard: string[],
  extras?: Partial<HandshakeRowLite>,
): HandshakeRowLite {
  return {
    id: `row-${userId}`,
    user_id: userId,
    my_token: myToken,
    heard_tokens: heard,
    lat: 47.655,
    lon: -122.303,
    created_at: new Date().toISOString(),
    ...extras,
  };
}

describe('proximity matching constants', () => {
  it('exposes expected scale limits for candidate fetch and host selection', () => {
    expect(PROXIMITY_MATCH_MAX_M).toBe(15);
    expect(PENDING_CANDIDATE_BBOX_RADIUS_M).toBe(3_000);
    expect(PENDING_CANDIDATE_MAX_ROWS).toBe(400);
    expect(PROXIMITY_HOST_SELECTION_MAX_MEMBERS).toBe(12);
  });
});

describe('metersToLatLonDelta / pendingCandidateBBox', () => {
  it('converts meters to latitude/longitude degree deltas', () => {
    const equator = metersToLatLonDelta(0, 1_000);
    expect(equator.dLat).toBeCloseTo(1_000 / 111_320, 8);
    expect(equator.dLon).toBeCloseTo(1_000 / 111_320, 8);

    const seattle = metersToLatLonDelta(47.6, 3_000);
    expect(seattle.dLat).toBeCloseTo(3_000 / 111_320, 8);
    expect(seattle.dLon).toBeGreaterThan(seattle.dLat);
  });

  it('builds a symmetric bbox around a point with default radius', () => {
    const lat = 47.655;
    const lon = -122.303;
    const box = pendingCandidateBBox(lat, lon);
    const { dLat, dLon } = metersToLatLonDelta(lat, PENDING_CANDIDATE_BBOX_RADIUS_M);

    expect(box.minLat).toBeCloseTo(lat - dLat, 10);
    expect(box.maxLat).toBeCloseTo(lat + dLat, 10);
    expect(box.minLon).toBeCloseTo(lon - dLon, 10);
    expect(box.maxLon).toBeCloseTo(lon + dLon, 10);
  });

  it('accepts an explicit radius override', () => {
    const box = pendingCandidateBBox(0, 0, 500);
    const { dLat, dLon } = metersToLatLonDelta(0, 500);
    expect(box.maxLat - box.minLat).toBeCloseTo(2 * dLat, 10);
    expect(box.maxLon - box.minLon).toBeCloseTo(2 * dLon, 10);
  });
});

describe('proximity matching peer evidence', () => {
  it('hasProximityPeerEvidence requires audio or BLE tokens', () => {
    expect(hasProximityPeerEvidence([], [])).toBe(false);
    expect(hasProximityPeerEvidence(['1234'], [])).toBe(true);
    expect(hasProximityPeerEvidence([], ['5678'])).toBe(true);
  });

  it('peerEvidenceTokens merges heard_tokens with sensor_payload BLE devices', () => {
    const lite = row('u1', '1111', ['2222'], {
      sensor_payload: { detected_devices_ble: ['3333', '2222'] },
    });
    expect(peerEvidenceTokens(lite).sort()).toEqual(['2222', '3333']);
  });

  it('links users via shared overheard token intersection (1-to-N clique)', () => {
    const a = row('a', '1111', ['9999']);
    const b = row('b', '2222', ['9999']);
    const c = row('c', '3333', ['9999']);
    expect(tokenEvidenceBetweenRows(a, b)).toBe(true);
    expect(tokenEvidenceBetweenRows(b, c)).toBe(true);

    const nodes = [a, b, c];
    const adj = buildUserAdjacency(nodes);
    const component = bfsComponent('a', adj);
    expect([...component].sort()).toEqual(['a', 'b', 'c']);
    expect(sharedOverlappingPeerTokens(nodes)).toEqual(['9999']);
  });

  it('buildUserAdjacency supports transitive 1-to-N chains', () => {
    const a = row('a', '1111', ['2222']);
    const b = row('b', '2222', ['1111', '3333']);
    const c = row('c', '3333', ['2222']);
    const nodes = [a, b, c];
    const adj = buildUserAdjacency(nodes);
    const component = bfsComponent('a', adj);
    expect([...component].sort()).toEqual(['a', 'b', 'c']);
  });

  it('buildUserAdjacency clusters ten simultaneous nearby taps', () => {
    const now = '2026-06-26T12:00:00.000Z';
    const nodes = Array.from({ length: 10 }, (_, i) =>
      row(`u${i + 1}`, `${1000 + i}`, [], {
        created_at: new Date(Date.parse(now) + i * 1_000).toISOString(),
        lat: 47.655 + i * 0.000001,
        lon: -122.303 + i * 0.000001,
      }),
    );

    const component = bfsComponent('u1', buildUserAdjacency(nodes));

    expect([...component].sort()).toEqual(nodes.map((n) => n.user_id).sort());
  });

  it('links simultaneous nearby taps when neither radio heard a token', () => {
    const now = '2026-06-26T12:00:00.000Z';
    const a = row('a', '1111', [], { created_at: now });
    const b = row('b', '2222', [], { created_at: '2026-06-26T12:00:20.000Z' });

    expect(tokenEvidenceBetweenRows(a, b)).toBe(false);
    expect(simultaneousTapEvidenceBetweenRows(a, b)).toBe(true);
    const adj = buildUserAdjacency([a, b]);
    expect([...bfsComponent('a', adj)].sort()).toEqual(['a', 'b']);
  });

  it('does not use simultaneous fallback for stale nearby pending rows', () => {
    const a = row('a', '1111', [], { created_at: '2026-06-26T12:00:00.000Z' });
    const b = row('b', '2222', [], { created_at: '2026-06-26T12:02:00.000Z' });

    expect(simultaneousTapEvidenceBetweenRows(a, b)).toBe(false);
    expect([...bfsComponent('a', buildUserAdjacency([a, b]))]).toEqual([]);
  });
});

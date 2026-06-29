import {
  bfsComponent,
  buildUserAdjacency,
  hasProximityPeerEvidence,
  peerEvidenceTokens,
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

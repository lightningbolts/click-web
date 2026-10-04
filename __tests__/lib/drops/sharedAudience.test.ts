/** @jest-environment node */

import { canSeeSharedDrop, selectStrip } from '@/lib/drops/sharedAudience';

const connected = { viewerConnected: true, posterKeepsConnection: true, posterMarkedCore: false };

describe('shared drop audience', () => {
  it('shows "all" drops to active connections on both sides', () => {
    expect(canSeeSharedDrop('all', connected)).toBe(true);
  });

  it('shows "core" drops only when the poster marked the connection core', () => {
    expect(canSeeSharedDrop('core', connected)).toBe(false);
    expect(canSeeSharedDrop('core', { ...connected, posterMarkedCore: true })).toBe(true);
  });

  it('hides drops once either side hides or blocks', () => {
    expect(canSeeSharedDrop('all', undefined)).toBe(false); // blocked, removed, or viewer hid
    expect(canSeeSharedDrop('all', { ...connected, viewerConnected: false })).toBe(false);
    expect(canSeeSharedDrop('all', { ...connected, posterKeepsConnection: false })).toBe(false);
    expect(canSeeSharedDrop('core', { ...connected, posterMarkedCore: true, posterKeepsConnection: false })).toBe(false);
  });
});

describe('selectStrip', () => {
  const NOW = Date.parse('2026-10-05T18:00:00Z');
  const H = 3_600_000;
  const config = { teaser: 'pixelated' as const, stripWindowHours: 24, stripMin: 25, stripMax: 150 };
  const drop = (id: string, userId: string, ageHours: number, revealInHours: number) => ({
    id,
    userId,
    createdAtMs: NOW - ageHours * H,
    revealAtMs: NOW + revealInHours * H,
  });
  const drops = [
    drop('pending-peer', 'peer', 2, 1),
    drop('ready-peer', 'peer', 48, -47),
    drop('pending-mine', 'me', 5, 1),
    drop('old', 'peer', 400, -399),
  ];
  const many = (count: number, ageHours: (i: number) => number) =>
    Array.from({ length: count }, (_, i) => drop(`d${i}`, 'peer', ageHours(i), -1));

  it('keeps the newest 25 whatever their age on a quiet day, newest first', () => {
    const ids = selectStrip(drops, 'me', NOW, config).map((d) => d.id);
    expect(ids).toEqual(['pending-peer', 'pending-mine', 'ready-peer', 'old']);
    expect(selectStrip(many(40, (i) => 30 + i), 'me', NOW, config)).toHaveLength(25);
  });

  it('keeps the whole last day once it has more than 25', () => {
    const busy = [...many(32, (i) => i * 0.5), ...many(10, (i) => 30 + i).map((d) => ({ ...d, id: `old-${d.id}` }))];
    const strip = selectStrip(busy, 'me', NOW, config);
    expect(strip).toHaveLength(32);
    expect(strip.every((d) => d.createdAtMs > NOW - 24 * H)).toBe(true);
    expect(selectStrip(busy, 'me', NOW, { ...config, stripMax: 28 })).toHaveLength(28);
  });

  it("hides others' pending drops when teasers are off, never your own", () => {
    const ids = selectStrip(drops, 'me', NOW, { ...config, teaser: 'none' }).map((d) => d.id);
    expect(ids).toEqual(['pending-mine', 'ready-peer', 'old']);
  });
});

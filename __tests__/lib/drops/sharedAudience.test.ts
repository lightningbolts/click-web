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
  const D = 86_400_000;
  const drop = (id: string, userId: string, ageDays: number, revealInHours: number) => ({
    id,
    userId,
    createdAtMs: NOW - ageDays * D,
    revealAtMs: NOW + revealInHours * 3_600_000,
  });
  const drops = [
    drop('pending-peer', 'peer', 0.1, 20),
    drop('ready-peer', 'peer', 2, -24),
    drop('pending-mine', 'me', 0.2, 20),
    drop('old', 'peer', 8, -170),
  ];

  it('keeps it recent, newest first, and bounded', () => {
    const ids = selectStrip(drops, 'me', NOW, { teaser: 'pixelated', stripDays: 7, stripLimit: 12 }).map((d) => d.id);
    expect(ids).toEqual(['pending-peer', 'pending-mine', 'ready-peer']);
    expect(selectStrip(drops, 'me', NOW, { teaser: 'pixelated', stripDays: 7, stripLimit: 2 })).toHaveLength(2);
  });

  it("hides others' pending drops when teasers are off, never your own", () => {
    const ids = selectStrip(drops, 'me', NOW, { teaser: 'none', stripDays: 7, stripLimit: 12 }).map((d) => d.id);
    expect(ids).toEqual(['pending-mine', 'ready-peer']);
  });
});

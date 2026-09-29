/** @jest-environment node */

import { DEFAULT_PRESENCE_CONFIG, summarizePresence } from '@/lib/map/soundtrackPresence';

const NOW = Date.parse('2026-10-05T18:00:00Z');
const MIN = 60_000;

describe('summarizePresence', () => {
  const rows = [
    { userId: 'me', lastSeenAtMs: NOW - 1 * MIN },
    { userId: 'friend', lastSeenAtMs: NOW - 2 * MIN },
    { userId: 'ghost-friend', lastSeenAtMs: NOW - 3 * MIN },
    { userId: 'stranger', lastSeenAtMs: NOW - 4 * MIN },
    { userId: 'lapsed-friend', lastSeenAtMs: NOW - 13 * MIN },
  ];
  const summary = summarizePresence({
    rows,
    viewerId: 'me',
    connectedPeerIds: new Set(['friend', 'ghost-friend', 'lapsed-friend']),
    ghostedUserIds: new Set(['ghost-friend']),
    nowMs: NOW,
    config: DEFAULT_PRESENCE_CONFIG,
  });

  it('counts everyone live, ghosts and strangers included, and drops lapsed heartbeats', () => {
    expect(summary.count).toBe(4);
    expect(summary.isListening).toBe(true);
  });

  it('names only non-ghosted connections, never strangers or the viewer', () => {
    expect(summary.namedUserIds).toEqual(['friend']);
  });
});

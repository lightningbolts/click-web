import { hubRealtimeChannel, mergeHubThreadWindow, normalizeHubMessageRow } from '@/lib/hub/hubThread';

describe('hubRealtimeChannel', () => {
  it('prefixes hub ids once', () => {
    expect(hubRealtimeChannel('hub_1')).toBe('hub:hub_1');
    expect(hubRealtimeChannel('hub:hub_1')).toBe('hub:hub_1');
    expect(hubRealtimeChannel('')).toBe('');
  });
});

describe('normalizeHubMessageRow', () => {
  it('requires id and hub_id', () => {
    expect(normalizeHubMessageRow({ id: 'm1' })).toBeNull();
    const row = normalizeHubMessageRow({
      id: 'm1',
      hub_id: 'hub_1',
      user_id: 'u1',
      body: 'hi',
      created_at: '2026-08-18T00:00:00.000Z',
    });
    expect(row?.message_type).toBe('text');
    expect(row?.body).toBe('hi');
  });
});

describe('mergeHubThreadWindow', () => {
  it('orders oldest-first and keeps the target', () => {
    const older = [
      normalizeHubMessageRow({
        id: 'm1',
        hub_id: 'h',
        user_id: 'u',
        body: 'a',
        created_at: '2026-08-18T00:00:01.000Z',
      })!,
      normalizeHubMessageRow({
        id: 'm2',
        hub_id: 'h',
        user_id: 'u',
        body: 'b',
        created_at: '2026-08-18T00:00:02.000Z',
      })!,
    ];
    const newer = [
      normalizeHubMessageRow({
        id: 'm3',
        hub_id: 'h',
        user_id: 'u',
        body: 'c',
        created_at: '2026-08-18T00:00:03.000Z',
      })!,
    ];
    const merged = mergeHubThreadWindow({ olderOrEqual: older, newer, target: older[1] });
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

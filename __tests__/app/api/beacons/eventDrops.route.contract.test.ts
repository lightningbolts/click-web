/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

const mockAuthorize = jest.fn();
const mockRole = jest.fn();
const mockFindByClient = jest.fn();
const mockInsert = jest.fn();
const mockVisible = jest.fn();
const mockDevelopedAt = jest.fn();

jest.mock('@/lib/server/eventDrops', () => ({
  ...jest.requireActual('@/lib/server/eventDrops'),
  authorizeEventDropRequest: (...args: unknown[]) => mockAuthorize(...args),
  loadEventRole: (...args: unknown[]) => mockRole(...args),
  findEventDropByClientId: (...args: unknown[]) => mockFindByClient(...args),
  insertEventDrop: (...args: unknown[]) => mockInsert(...args),
  visibleEventDrops: (...args: unknown[]) => mockVisible(...args),
  posterAbsenteeSetting: async () => true,
  serializeEventDrops: async (_admin: unknown, rows: Array<{ id: string }>) => rows.map((r) => ({ id: r.id })),
}));

jest.mock('@/lib/server/drops/develop', () => ({
  loadDevelopedAt: (...args: unknown[]) => mockDevelopedAt(...args),
}));

import { GET, POST } from '@/app/api/beacons/[beaconId]/drops/route';

const BEACON = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const now = Date.now();

function authorized(window: { opens: number; closes: number }) {
  return {
    ok: true,
    userId: 'me',
    admin: {},
    config: { perUserCap: 10, revealHourLocal: 10, absenteeLimit: 6 },
    event: {
      id: BEACON,
      title: 'Launch',
      creatorId: 'host',
      schedule: { opensAtMs: window.opens, closesAtMs: window.closes, revealAtMs: window.closes + 10 * 3_600_000 },
    },
  };
}

function post() {
  return POST(
    new NextRequest(`https://click.example/api/beacons/${BEACON}/drops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_drop_id: CLIENT_ID, mime_type: 'image/jpeg', original_b64: 'AAAA', preview_b64: 'AAAA' }),
    }),
    { params: Promise.resolve({ beaconId: BEACON }) },
  );
}

describe('POST /api/beacons/[beaconId]/drops', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthorize.mockResolvedValue(authorized({ opens: now - 3_600_000, closes: now + 3_600_000 }));
    mockRole.mockResolvedValue({ checkedIn: true, rsvpd: true, hosted: false });
    mockFindByClient.mockResolvedValue(null);
    mockInsert.mockResolvedValue({ row: { id: 'new-drop' } });
  });

  it('accepts a checked-in attendee inside the window', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ drop: { id: 'new-drop' } });
  });

  it('rejects an RSVP without check-in', async () => {
    mockRole.mockResolvedValue({ checkedIn: false, rsvpd: true, hosted: false });
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'not_checked_in' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects posts outside the window', async () => {
    mockAuthorize.mockResolvedValue(authorized({ opens: now - 7_200_000, closes: now - 1 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'window_closed' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects the drop past the cap', async () => {
    mockInsert.mockResolvedValue({ error: 'cap_reached' });
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'cap_reached' });
  });

  it('returns the existing drop for a retried upload', async () => {
    mockFindByClient.mockResolvedValue({ id: 'already-there' });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drop: { id: 'already-there' } });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/beacons/[beaconId]/drops', () => {
  const rows = [
    { id: 'a', user_id: 'me' },
    { id: 'b', user_id: 'friend' },
  ];

  function get() {
    return GET(new NextRequest(`https://click.example/api/beacons/${BEACON}/drops`), {
      params: Promise.resolve({ beaconId: BEACON }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockRole.mockResolvedValue({ checkedIn: true, rsvpd: true, hosted: false });
    mockVisible.mockResolvedValue(rows);
    mockDevelopedAt.mockResolvedValue({ b: '2026-10-05T17:05:00.000Z' });
  });

  it("carries the viewer's developed_at on each drop after the reveal", async () => {
    mockAuthorize.mockResolvedValue(authorized({ opens: now - 3 * 86_400_000, closes: now - 86_400_000 }));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('revealed');
    expect(body.drops).toEqual([
      { id: 'a', developed_at: null },
      { id: 'b', developed_at: '2026-10-05T17:05:00.000Z' },
    ]);
    expect(mockDevelopedAt).toHaveBeenCalledWith({}, 'me', 'event', ['a', 'b']);
  });

  it('skips the developed lookup before the reveal', async () => {
    mockAuthorize.mockResolvedValue(authorized({ opens: now - 7_200_000, closes: now - 1 }));
    const body = await (await get()).json();
    expect(body.state).toBe('developing');
    expect(body.drops.every((d: { developed_at: unknown }) => d.developed_at === null)).toBe(true);
    expect(mockDevelopedAt).not.toHaveBeenCalled();
  });
});

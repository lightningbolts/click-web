/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/me/event-bookmarks/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEACON_ID = '11111111-1111-4111-8111-111111111111';

function chainSelect(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  };
  (builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolve({ data: result.data, error: result.error }));
  return builder;
}

describe('GET /api/me/event-bookmarks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      user: null,
      authError: new Error('no session'),
    });
    const res = await GET(new NextRequest('http://localhost/api/me/event-bookmarks'));
    expect(res.status).toBe(401);
  });

  it('returns denormalized bookmarks for the caller', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      user: { id: USER_ID },
      authError: null,
    });

    const bookmarkBuilder = chainSelect({
      data: [
        {
          beacon_id: BEACON_ID,
          created_at: '2026-08-01T12:00:00.000Z',
          updated_at: '2026-08-01T12:00:00.000Z',
        },
      ],
      error: null,
    });
    const beaconBuilder = chainSelect({
      data: [
        {
          id: BEACON_ID,
          beacon_type: 'event',
          creator_id: USER_ID,
          created_at: '2026-07-01T10:00:00.000Z',
          show_creator_name: true,
          metadata: {
            title: 'Campus Night',
            event_start_at: '2026-08-10T20:00:00.000Z',
            event_end_at: '2026-08-10T23:00:00.000Z',
          },
          expires_at: '2026-08-10T23:00:00.000Z',
          location: 'POINT(-122.3 47.65)',
        },
      ],
      error: null,
    });
    const userBuilder = chainSelect({
      data: [
        {
          id: USER_ID,
          name: null,
          first_name: 'Ada',
          last_name: 'Lovelace',
        },
      ],
      error: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'event_bookmarks') return bookmarkBuilder;
        if (table === 'map_beacons') return beaconBuilder;
        if (table === 'users') return userBuilder;
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const res = await GET(new NextRequest('http://localhost/api/me/event-bookmarks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookmarks).toHaveLength(1);
    expect(body.bookmarks[0]).toMatchObject({
      beacon_id: BEACON_ID,
      title: 'Campus Night',
      creator_id: USER_ID,
      creator_name: 'Ada Lovelace',
      created_at: '2026-07-01T10:00:00.000Z',
      show_creator_name: true,
    });
  });
});

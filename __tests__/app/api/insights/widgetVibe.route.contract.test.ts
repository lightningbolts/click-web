/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as widgetVibeGet } from '@/app/api/insights/widget-vibe/route';
import { expectFilter, makeSupabaseMock, type QueryResult } from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

const MOCK_USER_ID = 'user-consumer-7777';

const ok = (data: unknown): QueryResult => ({ data, error: null });

/** Rows the payload builder counts as active chat-list connections. */
function activeRows(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `conn-${startIndex + i}`,
    status: 'active',
    expiry_state: 'kept',
    has_begun: true,
    user_ids: [MOCK_USER_ID, `user-${startIndex + i}`],
  }));
}

function setupSupabase(connections: QueryResult) {
  const mock = makeSupabaseMock({ tables: { connections } });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user: { id: MOCK_USER_ID },
    authError: null,
  });

  return mock;
}

function callRoute() {
  return widgetVibeGet(new NextRequest('http://localhost/api/insights/widget-vibe'));
}

describe('GET /api/insights/widget-vibe contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
  });

  // 1. SECURITY CONTROLS
  describe('Security Controls & Cache Headers', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Unauthenticated'),
      });

      const res = await callRoute();

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('restricts the connections query to the signed-in user', async () => {
      const mock = setupSupabase(ok([]));

      await callRoute();

      // Without this filter the widget would count every user's connections.
      expectFilter(mock.builder('connections'), 'user_ids', [MOCK_USER_ID], 'contains');
    });

    it('sets correct Cache-Control and Vary headers on successful response', async () => {
      setupSupabase(ok([]));

      const res = await callRoute();

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=300');
      expect(res.headers.get('Vary')).toBe('Authorization');
    });
  });

  // 2. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('calculates density hex color and status text based on active connections', async () => {
      setupSupabase(
        ok([
          ...activeRows(2),
          { id: 'conn-3', status: 'archived', expiry_state: 'archived', has_begun: true, user_ids: [MOCK_USER_ID, 'user-4'] },
        ]),
      );

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.active_counts).toBe(2);
      expect(body.density_hex_color).toBe('#22c55e'); // Green for 1-3 connections
      expect(body.status_text).toContain('2 active connections');
    });

    it('returns quiet status copy when user has 0 active connections', async () => {
      setupSupabase(ok([]));

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.active_counts).toBe(0);
      expect(body.density_hex_color).toBe('#94a3b8');
      expect(body.status_text).toContain('Quiet');
    });

    it('uses singular copy for exactly one active connection', async () => {
      setupSupabase(ok(activeRows(1)));

      const res = await callRoute();

      const body = await res.json();
      expect(body.active_counts).toBe(1);
      expect(body.status_text).toBe('One active thread — your circle is humming.');
    });

    it.each([
      [4, '#eab308'],
      [9, '#f97316'],
      [16, '#a855f7'],
    ])('maps %i active connections to %s', async (count, color) => {
      setupSupabase(ok(activeRows(count)));

      const res = await callRoute();

      const body = await res.json();
      expect(body.active_counts).toBe(count);
      expect(body.density_hex_color).toBe(color);
    });
  });

  // 3. DATA INTEGRITY
  describe('Data Integrity', () => {
    it('returns 500 when Supabase query returns database error', async () => {
      setupSupabase({ data: null, error: { message: 'DB connection timeout' } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to load connections');
    });

    it('treats a null result set as zero active connections', async () => {
      setupSupabase(ok(null));

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.active_counts).toBe(0);
    });

    it('does not echo connection ids or member lists back to the widget', async () => {
      setupSupabase(ok(activeRows(2)));

      const res = await callRoute();
      const rawText = await res.text();

      expect(rawText).not.toContain(MOCK_USER_ID);
      expect(rawText).not.toContain('conn-0');
      expect(Object.keys(JSON.parse(rawText)).sort()).toEqual([
        'active_counts',
        'density_hex_color',
        'status_text',
      ]);
    });
  });

  // 4. PERFORMANCE LIMITS
  describe('Performance Limits', () => {
    it('computes widget vibe payload for 10,000 connection rows in < 50ms', async () => {
      const largeConnectionRows = Array.from({ length: 10000 }, (_, i) => ({
        id: `conn-${i}`,
        status: i % 2 === 0 ? 'active' : 'archived',
        expiry_state: i % 2 === 0 ? 'kept' : 'archived',
        has_begun: true,
        user_ids: [MOCK_USER_ID, `user-${i}`],
      }));

      setupSupabase(ok(largeConnectionRows));

      const startTime = performance.now();
      const res = await callRoute();
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.active_counts).toBe(5000);
      expect(durationMs).toBeLessThan(50);
    });
  });
});

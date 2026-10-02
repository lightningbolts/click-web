/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockEmit = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({ from: mockFrom }) }));
jest.mock('@/lib/server/telemetry/productEvents', () => ({
  ...jest.requireActual('@/lib/server/telemetry/productEvents'),
  emitProductEvent: (...args: unknown[]) => mockEmit(...args),
}));

import { POST } from '@/app/api/telemetry/events/route';

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('https://click.example/api/telemetry/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'gte']) c[m] = () => c;
  c.maybeSingle = async () => result;
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result));
  return c;
}

describe('POST /api/telemetry/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: 'me' }, authError: null });
    mockEmit.mockResolvedValue(true);
  });

  it('refuses events only the server may record', async () => {
    const res = await post({ event: 'drop_posted', props: { kind: 'chat' } });
    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('records a day-2 return once, on the app open that earns it', async () => {
    const install = new Date(Date.now() - 30 * 3_600_000).toISOString();
    mockFrom
      .mockReturnValueOnce(chain({ data: { occurred_at: install } })) // latest install
      .mockReturnValueOnce(chain({ count: 0 })); // no day-2 yet
    const res = await post({ event: 'app_open', platform: 'ios' });
    expect(res.status).toBe(202);
    expect(mockEmit.mock.calls.map((c) => c[2])).toEqual(['app_open', 'day2_return']);
  });
});

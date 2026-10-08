/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockListOwnedTickets = jest.fn();
const mockIsGoing = jest.fn();
const mockBuild = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({}) }));
jest.mock('@/lib/events/publicEvent', () => ({
  loadPublicEventPayload: async () => ({ beacon_id: EVENT, title: 'Run Club', location_name: null, place: null }),
}));
jest.mock('@/lib/server/wallet/passArt', () => ({
  passArt: async () => ({ backgroundColor: [0, 0, 0], images: {} }),
  cssRgb: () => 'rgb(0, 0, 0)',
}));
jest.mock('@/lib/server/ticketing/ownedTickets', () => ({
  listOwnedTickets: (...args: unknown[]) => mockListOwnedTickets(...args),
}));
jest.mock('@/lib/server/eventPass', () => {
  const actual = jest.requireActual('@/lib/server/eventPass');
  return {
    ...actual,
    walletConfig: () => ({ passTypeIdentifier: 'pass.co.joinclick.event', teamIdentifier: 'TEAM' }),
    eventPassKey: () => Buffer.from('k'),
    hasRsvpPass: (...args: unknown[]) => mockIsGoing(...args),
    loadPassHolder: async (_admin: unknown, userId: string) => ({ userId, name: 'Ada', avatarUrl: null }),
    buildWalletPass: (...args: unknown[]) => mockBuild(...args),
  };
});

import { GET } from '@/app/api/beacons/[beaconId]/pass/wallet/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TICKET = '44444444-4444-4444-8444-444444444444';

const wallet = (query = '') =>
  GET(new NextRequest(`https://click.example/api/beacons/${EVENT}/pass/wallet${query}`), {
    params: Promise.resolve({ beaconId: EVENT }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockGetUser.mockResolvedValue({ user: { id: ME }, authError: null });
  mockBuild.mockResolvedValue(Buffer.from('pkpass'));
  mockIsGoing.mockResolvedValue(false);
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('GET /api/beacons/:id/pass/wallet?ticket=', () => {
  it("builds a pass for the viewer's live ticket", async () => {
    mockListOwnedTickets.mockResolvedValue([{ id: TICKET, status: 'valid', tier_name: 'VIP' }]);
    const res = await wallet(`?ticket=${TICKET}`);
    expect(res.status).toBe(200);
    expect(mockListOwnedTickets).toHaveBeenCalledWith(expect.anything(), ME, { beaconId: EVENT, ticketId: TICKET });
    const [, passJson] = mockBuild.mock.calls[0]!;
    expect(passJson.serialNumber).toBe(TICKET);
  });

  it('404s for a ticket that is not theirs or no longer admits', async () => {
    mockListOwnedTickets.mockResolvedValue([]);
    expect((await wallet(`?ticket=${TICKET}`)).status).toBe(404);
    mockListOwnedTickets.mockResolvedValue([{ id: TICKET, status: 'refunded', tier_name: 'VIP' }]);
    expect((await wallet(`?ticket=${TICKET}`)).status).toBe(404);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('still needs an RSVP for a plain Click Pass', async () => {
    expect((await wallet()).status).toBe(403);
  });
});

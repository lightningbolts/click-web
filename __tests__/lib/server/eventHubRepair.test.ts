import { ensureEventHubForBeacon } from '@/lib/server/eventHubRepair';
import { createHubForEventBeacon, findHubForEventBeacon } from '@/lib/server/eventHubLifecycle';

jest.mock('@/lib/server/eventHubLifecycle', () => ({
  createHubForEventBeacon: jest.fn(),
  findHubForEventBeacon: jest.fn(),
}));

const mockFindHubForEventBeacon = findHubForEventBeacon as jest.MockedFunction<typeof findHubForEventBeacon>;
const mockCreateHubForEventBeacon = createHubForEventBeacon as jest.MockedFunction<typeof createHubForEventBeacon>;

const HUB = {
  id: 'hub_event_test',
  name: 'Machine Learning',
  creator_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event_beacon_id: '11111111-1111-4111-8111-111111111111',
  expires_at: '2026-10-02T00:00:00.000Z',
};

function admin() {
  const attendeeEq = jest.fn().mockResolvedValue({ data: [], error: null });
  const attendeeSelect = jest.fn().mockReturnValue({ eq: attendeeEq });
  const participantUpsert = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === 'beacon_attendees') return { select: attendeeSelect };
    if (table === 'hub_participants') return { upsert: participantUpsert };
    throw new Error(`Unexpected table ${table}`);
  });
  return { client: { from } as never, participantUpsert };
}

const INPUT = {
  beaconId: HUB.event_beacon_id,
  creatorId: HUB.creator_id,
  lat: 47.655,
  lng: -122.303,
  metadata: {
    title: HUB.name,
    event_start_at: '2026-09-20T00:00:00.000Z',
    event_end_at: '2026-10-01T00:00:00.000Z',
  },
  expiresAt: '2026-10-01T00:00:00.000Z',
};

describe('ensureEventHubForBeacon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an existing canonical hub without provisioning another one', async () => {
    const { client } = admin();
    mockFindHubForEventBeacon.mockResolvedValue(HUB);

    const result = await ensureEventHubForBeacon(client, INPUT);

    expect(result).toEqual({ hub: HUB, repaired: false });
    expect(mockCreateHubForEventBeacon).not.toHaveBeenCalled();
  });

  it('provisions an active legacy event and reconciles participants', async () => {
    const { client, participantUpsert } = admin();
    mockFindHubForEventBeacon
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(HUB);
    mockCreateHubForEventBeacon.mockResolvedValue({ hubId: HUB.id });

    const result = await ensureEventHubForBeacon(client, INPUT);

    expect(result).toEqual({ hub: HUB, repaired: true });
    expect(mockCreateHubForEventBeacon).toHaveBeenCalledTimes(1);
    expect(participantUpsert).toHaveBeenCalled();
  });

  it('re-reads the canonical hub when a concurrent provision wins the unique link race', async () => {
    const { client, participantUpsert } = admin();
    mockFindHubForEventBeacon
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(HUB);
    mockCreateHubForEventBeacon.mockResolvedValue({ error: 'duplicate key value violates unique constraint' });

    const result = await ensureEventHubForBeacon(client, INPUT);

    expect(result).toEqual({ hub: HUB, repaired: false });
    expect(participantUpsert).toHaveBeenCalled();
  });

  it('does not provision an expired event with no historical hub', async () => {
    const { client } = admin();
    mockFindHubForEventBeacon.mockResolvedValue(null);

    const result = await ensureEventHubForBeacon(client, {
      ...INPUT,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    expect(result).toEqual({ hub: null, repaired: false, reason: 'expired' });
    expect(mockCreateHubForEventBeacon).not.toHaveBeenCalled();
  });
});

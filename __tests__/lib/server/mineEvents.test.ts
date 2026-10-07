import { loadMineEvents } from '@/lib/server/events/mineEvents';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOSTED = '11111111-1111-4111-8111-111111111111';
const GOING = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: { message: string } | null };

/** A PostgREST builder stand-in: every call chains, awaiting it yields `result`, and calls are recorded. */
function query(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'range']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

function event(id: string, title: string) {
  return {
    id,
    beacon_type: 'event',
    location: null,
    starts_at: '2099-10-08T00:00:00.000Z',
    ends_at: '2099-10-08T01:00:00.000Z',
    metadata: { title },
  };
}

function admin(rsvps: Result) {
  const created = query({ data: [event(HOSTED, 'Hosted')], error: null });
  const attendees = query(rsvps);
  const going = query({ data: [event(GOING, 'Board Meeting')], error: null });
  const beaconQueries = [created, going];
  const from = jest.fn((table: string) => {
    if (table === 'map_beacons') return beaconQueries.shift()!.builder;
    if (table === 'beacon_attendees') return attendees.builder;
    // RSVP counts (`countEventRsvpsByBeaconIds`).
    return query({ data: [], error: null }).builder;
  });
  return { client: { from } as never, attendees };
}

describe('loadMineEvents', () => {
  it('returns the events you RSVPed to alongside the ones you host, newest RSVPs first', async () => {
    const { client, attendees } = admin({ data: [{ beacon_id: GOING }], error: null });

    const events = await loadMineEvents(client, ME);

    expect(events.map((e) => [e.beacon_id, e.role])).toEqual(
      expect.arrayContaining([
        [HOSTED, 'creator'],
        [GOING, 'rsvp'],
      ]),
    );
    // `beacon_attendees` has `rsvpd_at` (when you last RSVPed), not `signed_up_at`.
    expect(attendees.calls).toContainEqual(['order', ['rsvpd_at', { ascending: false }]]);
  });

  it('fails instead of reporting no RSVPs when the RSVP read fails', async () => {
    const { client } = admin({ data: null, error: { message: 'column does not exist' } });

    await expect(loadMineEvents(client, ME)).rejects.toThrow('mine rsvps: column does not exist');
  });
});

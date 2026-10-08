/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockRequireEventManager = jest.fn();
const mockGrantHub = jest.fn();

jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));
jest.mock('@/lib/server/eventHubLifecycle', () => ({
  grantEventHubOnCheckIn: (...args: unknown[]) => mockGrantHub(...args),
}));
jest.mock('@/lib/server/runtimeEnv', () => ({
  runtimeEnv: (name: string) => (name === 'EVENT_PASS_SECRET' ? 'test-pass-secret' : undefined),
}));

import { POST } from '@/app/api/beacons/[beaconId]/pass/scan/route';
import { eventPassUrl, mintEventPassToken, mintTicketToken } from '@/lib/events/eventPass';
import { hashTicketToken } from '@/lib/server/ticketing/credentials';

const BEACON_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = Buffer.from('test-pass-secret', 'utf8');
const TICKET_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_TICKET_ID = '44444444-4444-4444-8444-444444444445';
const OTHER_BEACON_ID = '99999999-9999-4999-8999-999999999999';

/** Only the single-row check-in read fails; writes still go through (the dangerous case). */
function failingCheckInRead(client: FakeDb['client']): FakeDb['client'] {
  return {
    ...client,
    from: ((table: string) => {
      const query = client.from(table);
      if (table !== 'event_check_ins') return query;
      const select = query.select.bind(query);
      query.select = ((...args: Parameters<typeof select>) => {
        const chain = select(...args);
        chain.maybeSingle = (async () => ({ data: null, error: { message: 'connection reset' } })) as unknown as typeof chain.maybeSingle;
        return chain;
      }) as typeof query.select;
      return query;
    }) as FakeDb['client']['from'],
  };
}

type TicketScan = { result: string; status?: string };

function world(opts: { going?: boolean; checkedIn?: boolean; failCheckInRead?: boolean; ticketScan?: TicketScan } = {}) {
  const db = new FakeDb({
    rpc: {
      ticketing_check_in: () => ({
        ok: true,
        result: opts.ticketScan?.result ?? 'accepted',
        ticket_id: TICKET_ID,
        owner_user_id: GUEST_ID,
        ticket_number: 'CLK-7QX2-K9P4M',
        tier_name: 'General',
        checked_in_at: '2026-10-06T19:00:00.000Z',
      }),
    },
    tables: {
      tickets: [
        { id: TICKET_ID, beacon_id: BEACON_ID, qr_token_hash: 'stored-hash' },
        { id: OTHER_TICKET_ID, beacon_id: OTHER_BEACON_ID, qr_token_hash: 'other-hash' },
      ],
      users: [{ id: GUEST_ID, first_name: 'Ada', last_name: 'Lovelace', name: null, image: 'https://img/ada.jpg' }],
      beacon_attendees: opts.going === false ? [] : [{ beacon_id: BEACON_ID, user_id: GUEST_ID }],
      event_check_ins: opts.checkedIn
        ? [{ beacon_id: BEACON_ID, user_id: GUEST_ID, checked_in_at: '2026-10-06T19:00:00.000Z', checked_out_at: null, check_in_count: 1 }]
        : [],
      map_beacons: [{ id: BEACON_ID, metadata: {} }],
      event_engagement_events: [],
    },
  });
  mockRequireEventManager.mockResolvedValue({
    ok: true,
    admin: opts.failCheckInRead ? failingCheckInRead(db.client) : db.client,
    userId: HOST_ID,
    beacon: { id: BEACON_ID, creator_id: HOST_ID, venue_id: null, beacon_type: 'event' },
  });
  return db;
}

function scan(credential: string | { ticket_id: string }) {
  return POST(
    new NextRequest(`https://click.example/api/beacons/${BEACON_ID}/pass/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(typeof credential === 'string' ? { credential } : credential),
    }),
    { params: Promise.resolve({ beaconId: BEACON_ID }) },
  );
}

const passURL = (beaconId = BEACON_ID, userId = GUEST_ID) =>
  eventPassUrl('https://joinclick.co', beaconId, mintEventPassToken(KEY, beaconId, userId));

describe('POST /api/beacons/[beaconId]/pass/scan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks a going guest in and opens the event chat to them', async () => {
    const db = world();
    const res = await scan(passURL());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      result: 'checked_in',
      attendee: { user_id: GUEST_ID, name: 'Ada Lovelace', avatar_url: 'https://img/ada.jpg' },
      check_in_count: 1,
    });
    expect(db.rows('event_check_ins')[0]).toMatchObject({ user_id: GUEST_ID, source: 'pass_scan', checked_out_at: null });
    expect(mockGrantHub).toHaveBeenCalledWith(expect.anything(), BEACON_ID, GUEST_ID);
  });

  it('catches a second scan of the same pass', async () => {
    world({ checkedIn: true });
    const body = await (await scan(passURL())).json();
    expect(body).toMatchObject({ result: 'already_checked_in', checked_in_at: '2026-10-06T19:00:00.000Z' });
    expect(mockGrantHub).not.toHaveBeenCalled();
  });

  it('refuses a pass whose RSVP was cancelled', async () => {
    world({ going: false });
    const body = await (await scan(passURL())).json();
    expect(body).toMatchObject({ result: 'not_going', attendee: { name: 'Ada Lovelace' } });
  });

  it('names a pass for another event, and rejects forgeries and noise', async () => {
    world();
    const other = '22222222-2222-4222-8222-222222222222';
    expect((await (await scan(passURL(other))).json()).result).toBe('wrong_event');
    // Flip a full signature character (the last one carries base64 padding bits).
    const url = passURL();
    const at = url.length - 5;
    const forged = url.slice(0, at) + (url[at] === 'A' ? 'B' : 'A') + url.slice(at + 1);
    expect((await (await scan(forged)).json()).result).toBe('invalid');
    expect((await (await scan('hello')).json()).result).toBe('invalid');
  });

  it('fails closed when the check-in read fails (never re-admits a shared pass)', async () => {
    const db = world({ checkedIn: true, failCheckInRead: true });
    const res = await scan(passURL());
    expect(res.status).toBe(500);
    expect(mockGrantHub).not.toHaveBeenCalled();
    expect(db.rows('event_check_ins')[0]).toMatchObject({ checked_in_at: '2026-10-06T19:00:00.000Z', check_in_count: 1 });
  });

  it('defers to the manager guard', async () => {
    mockRequireEventManager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await scan(passURL())).status).toBe(403);
  });
});

describe('ticket scans at the same door', () => {
  const ticketURL = (beaconId = BEACON_ID) =>
    eventPassUrl('https://joinclick.co', beaconId, mintTicketToken(KEY, beaconId, TICKET_ID));
  const checkInCalls = (db: FakeDb) => db.log.filter((entry) => entry.table === 'rpc:ticketing_check_in');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TICKETING_ENABLED = 'true';
  });
  afterAll(() => {
    delete process.env.TICKETING_ENABLED;
  });

  it('admits a valid ticket and checks its holder in', async () => {
    const db = world();
    const url = ticketURL();
    const body = await (await scan(url)).json();
    expect(body).toMatchObject({
      result: 'checked_in',
      tier_name: 'General',
      attendee: { user_id: GUEST_ID, name: 'Ada Lovelace', avatar_url: 'https://img/ada.jpg' },
      check_in_count: 1,
    });
    const token = new URL(url).searchParams.get('pass')!;
    expect(checkInCalls(db)[0]!.payload).toMatchObject({ p_beacon: BEACON_ID, p_token_hash: hashTicketToken(token), p_scanner: HOST_ID });
    expect(db.rows('event_check_ins')[0]).toMatchObject({ user_id: GUEST_ID, source: 'ticket_scan', checked_out_at: null });
    expect(mockGrantHub).toHaveBeenCalledWith(expect.anything(), BEACON_ID, GUEST_ID);
  });

  it('catches a ticket scanned twice without checking in again', async () => {
    const db = world({ ticketScan: { result: 'already_checked_in' } });
    const body = await (await scan(ticketURL())).json();
    expect(body).toMatchObject({ result: 'already_checked_in', checked_in_at: '2026-10-06T19:00:00.000Z', tier_name: 'General' });
    expect(db.rows('event_check_ins')).toHaveLength(0);
    expect(mockGrantHub).not.toHaveBeenCalled();
  });

  it('turns away refunded, voided and cancelled-event tickets', async () => {
    for (const [rpc, expected] of [
      ['refunded', 'refunded'],
      ['void', 'invalid'],
      ['event_cancelled', 'event_cancelled'],
    ]) {
      const db = world({ ticketScan: { result: rpc } });
      expect((await (await scan(ticketURL())).json()).result).toBe(expected);
      expect(db.rows('event_check_ins')).toHaveLength(0);
    }
  });

  it('rejects a forged ticket without touching the database', async () => {
    const db = world();
    const url = ticketURL();
    const forged = url.slice(0, -2) + (url.endsWith('AA') ? 'BB' : 'AA');
    expect((await (await scan(forged)).json()).result).toBe('invalid');
    expect(checkInCalls(db)).toHaveLength(0);
  });

  it('checks in by ticket id from the attendee list', async () => {
    const db = world();
    expect((await (await scan({ ticket_id: TICKET_ID })).json()).result).toBe('checked_in');
    expect(checkInCalls(db)[0]!.payload).toMatchObject({ p_token_hash: 'stored-hash' });

    const other = world();
    expect((await (await scan({ ticket_id: OTHER_TICKET_ID })).json()).result).toBe('wrong_event');
    expect(checkInCalls(other)).toHaveLength(0);
  });

  it('treats tickets as invalid while ticketing is off', async () => {
    process.env.TICKETING_ENABLED = 'false';
    const db = world();
    expect((await (await scan(ticketURL())).json()).result).toBe('invalid');
    expect((await (await scan({ ticket_id: TICKET_ID })).json()).result).toBe('invalid');
    expect(checkInCalls(db)).toHaveLength(0);
  });

  it('retires the separate ticket check-in endpoint', async () => {
    const retired = '@/app/api/beacons/[beaconId]/tickets/check-in/route';
    await expect(import(retired)).rejects.toThrow();
  });
});

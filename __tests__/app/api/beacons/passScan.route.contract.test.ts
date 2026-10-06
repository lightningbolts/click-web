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
import { eventPassUrl, mintEventPassToken } from '@/lib/events/eventPass';

const BEACON_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = Buffer.from('test-pass-secret', 'utf8');

function world(opts: { going?: boolean; checkedIn?: boolean } = {}) {
  const db = new FakeDb({
    tables: {
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
    admin: db.client,
    userId: HOST_ID,
    beacon: { id: BEACON_ID, creator_id: HOST_ID, venue_id: null, beacon_type: 'event' },
  });
  return db;
}

function scan(credential: string) {
  return POST(
    new NextRequest(`https://click.example/api/beacons/${BEACON_ID}/pass/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
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

  it('defers to the manager guard', async () => {
    mockRequireEventManager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await scan(passURL())).status).toBe(403);
  });
});

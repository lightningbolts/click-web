/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { POST as hubCreate } from '@/app/api/hub/create/route';
import { loadPublicEventPayload } from '@/lib/events/publicEvent';
import { countConnectionsViaPlaceEncounters, withPlaceRefs } from '@/lib/server/places/placeRefs';
import { FakeDb } from '../../../helpers/fakeSupabase';
import { CAFE, IDS, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null } = { db: null };

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: async () => ({ ok: true, user: { id: IDS.viewer }, bearer: 'jwt' }),
  createChatGatekeeperAdmin: () => mockState.db!.client,
}));

const asClient = (db: FakeDb) => db.client as unknown as SupabaseClient;

function worldWithResolver(resolvesTo: string | null) {
  return placesWorld({ db: { rpc: { resolve_place_at: () => resolvesTo } } });
}

describe('event payload place (§5.11.1)', () => {
  it('adds place only for listed, verified Places', async () => {
    const db = placesWorld();
    const items = await withPlaceRefs(asClient(db), [
      { id: 'e1', venue_id: IDS.cafe },
      { id: 'e2', venue_id: IDS.unlisted },
      { id: 'e3', venue_id: null },
    ]);
    expect(items.map((i) => i.place)).toEqual([
      { id: IDS.cafe, slug: 'cafe-allegro-seattle', name: 'Café Allegro', category: 'cafe', photo_url: null, city: 'Seattle' },
      null,
      null,
    ]);
  });

  it('includes place on the public event payload', async () => {
    const db = placesWorld({
      extra: {
        map_beacons: [
          { id: 'ev-1', beacon_type: 'event', venue_id: IDS.cafe, metadata: { title: 'Open mic' }, location: null, show_creator_name: false, creator_id: IDS.manager, visibility_audience: 'everyone' },
          { id: 'ev-2', beacon_type: 'event', venue_id: IDS.unlisted, metadata: { title: 'Hidden' }, location: null, show_creator_name: false, creator_id: IDS.manager, visibility_audience: 'everyone' },
        ],
        beacon_attendees: [],
        event_guest_rsvps: [],
      },
    });
    expect((await loadPublicEventPayload(asClient(db), 'ev-1'))?.place).toEqual({
      id: IDS.cafe,
      slug: 'cafe-allegro-seattle',
      name: 'Café Allegro',
      category: 'cafe',
      photo_url: null,
      city: 'Seattle',
    });
    expect((await loadPublicEventPayload(asClient(db), 'ev-2'))?.place).toBeNull();
  });
});

describe('POST /api/hub/create inside a Place (§5.11.2)', () => {
  const create = () =>
    hubCreate(
      new NextRequest('http://localhost/api/hub/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Study crew', category: 'study', location: { latitude: CAFE.lat, longitude: CAFE.lng } }),
      }),
    );

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  });

  it('returns 409 place_hub_exists inside a listed Place with its hub on', async () => {
    mockState.db = worldWithResolver(IDS.cafe);
    const res = await create();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'This Place already has a hub',
      code: 'place_hub_exists',
      place_id: IDS.cafe,
      slug: 'cafe-allegro-seattle',
      hub_id: `place-${IDS.cafe}`,
    });
    expect(mockState.db.rows('hub_venues')).toHaveLength(1);
  });

  it('behaves as today when the Place has no hub', async () => {
    mockState.db = worldWithResolver(IDS.cafe);
    mockState.db.rows('places')[0].hub_enabled = false;
    const res = await create();
    expect(res.status).toBe(200);
    expect(mockState.db.rows('hub_venues')).toHaveLength(2);
  });

  it('behaves as today outside any Place', async () => {
    mockState.db = worldWithResolver(null);
    expect((await create()).status).toBe(200);
  });
});

describe('connections_via_place_encounters (§5.11.4)', () => {
  it('counts distinct eligible handshake connections from the last 30 days', async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const db = new FakeDb({
      tables: {
        connection_encounters: [
          { id: 'a', place_id: 'p1', connection_id: 'c-ok', encountered_at: recent },
          { id: 'b', place_id: 'p1', connection_id: 'c-ok', encountered_at: recent },
          { id: 'c', place_id: 'p1', connection_id: 'c-optout', encountered_at: recent },
          { id: 'd', place_id: 'p1', connection_id: 'c-prior', encountered_at: recent },
          { id: 'e', place_id: 'p1', connection_id: 'c-old', encountered_at: old },
          { id: 'f', place_id: 'p2', connection_id: 'c-other', encountered_at: recent },
        ],
        connections: [
          { id: 'c-ok', include_in_business_insights: true, source: 'handshake' },
          { id: 'c-optout', include_in_business_insights: false, source: 'handshake' },
          { id: 'c-prior', include_in_business_insights: true, source: 'prior' },
          { id: 'c-old', include_in_business_insights: true, source: 'handshake' },
          { id: 'c-other', include_in_business_insights: true, source: 'handshake' },
        ],
      },
    });
    await expect(countConnectionsViaPlaceEncounters(asClient(db), 'p1')).resolves.toBe(1);
  });
});

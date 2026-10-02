/**
 * A small Click Places world for route contract tests: two listed Places, one unlisted, and a
 * viewer with a friend (opted in to Place visibility), a ghosted friend, a blocked friend, a
 * stranger and a manager.
 */
import { NextRequest } from 'next/server';
import { FakeDb, type FakeDbOptions } from './fakeSupabase';

export const IDS = {
  viewer: '11111111-1111-4111-8111-111111111111',
  friend: '22222222-2222-4222-8222-222222222222',
  ghost: '33333333-3333-4333-8333-333333333333',
  blocked: '44444444-4444-4444-8444-444444444444',
  stranger: '55555555-5555-4555-8555-555555555555',
  manager: '66666666-6666-4666-8666-666666666666',
  cafe: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bar: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  unlisted: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  connFriend: 'c0000000-0000-4000-8000-000000000001',
  connGhost: 'c0000000-0000-4000-8000-000000000002',
  connBlocked: 'c0000000-0000-4000-8000-000000000003',
  anchor: 'a0000000-0000-4000-8000-000000000001',
  anchorToken: 'f0000000-0000-4000-8000-000000000001',
} as const;

export const CAFE = { lat: 47.6588, lng: -122.3131 };
export const metersNorth = (m: number) => CAFE.lat + m / 111_195;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const place = (id: string, overrides: Record<string, unknown>) => ({
  id,
  slug: null,
  name: 'Place',
  category: 'cafe',
  description: null,
  photo_path: null,
  hours: null,
  timezone: 'America/Los_Angeles',
  address_line: null,
  city: 'Seattle',
  region: null,
  postal_code: null,
  country_code: 'US',
  website_url: null,
  latitude: CAFE.lat,
  longitude: CAFE.lng,
  radius_meters: 75,
  verification_status: 'verified',
  listed: true,
  hub_enabled: false,
  location: null,
  subscription_status: 'inactive',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  first_name: name,
  last_name: null,
  image: null,
  ghost_mode: false,
  place_visits_visible_to_connections: false,
  location_include_in_insights_enabled: false,
  ...extra,
});

export function placesWorld(options: { flagOn?: boolean; extra?: Partial<Record<string, Record<string, unknown>[]>>; db?: FakeDbOptions } = {}) {
  const flagOn = options.flagOn !== false;
  const tables: Record<string, Record<string, unknown>[]> = {
    feature_flags: [
      {
        key: 'click_places',
        enabled: flagOn,
        rollout_percent: 0,
        allow_user_ids: flagOn ? [IDS.viewer, IDS.friend, IDS.manager, IDS.stranger] : [],
        config: {},
      },
    ],
    places: [
      place(IDS.cafe, { slug: 'cafe-allegro-seattle', name: 'Café Allegro', category: 'cafe', hub_enabled: true }),
      place(IDS.bar, { slug: 'back-bar-seattle', name: 'Back Bar', category: 'bar', latitude: 47.6688 }),
      place(IDS.unlisted, { slug: 'secret-seattle', name: 'Secret', listed: false }),
    ],
    place_managers: [{ id: 'pm-1', place_id: IDS.cafe, user_id: IDS.manager, role: 'owner' }],
    users: [
      user(IDS.viewer, 'Viewer', { location_include_in_insights_enabled: true }),
      user(IDS.friend, 'Maya', { place_visits_visible_to_connections: true }),
      user(IDS.ghost, 'Ghosty', { ghost_mode: true, place_visits_visible_to_connections: true }),
      user(IDS.blocked, 'Blocky', { place_visits_visible_to_connections: true }),
      user(IDS.stranger, 'Stranger', { place_visits_visible_to_connections: true }),
      user(IDS.manager, 'Manager'),
    ],
    connections: [
      { id: IDS.connFriend, user_ids: [IDS.viewer, IDS.friend], status: 'active', expiry_state: 'active' },
      { id: IDS.connGhost, user_ids: [IDS.viewer, IDS.ghost], status: 'active', expiry_state: 'active' },
      { id: IDS.connBlocked, user_ids: [IDS.viewer, IDS.blocked], status: 'active', expiry_state: 'active' },
    ],
    user_blocks: [{ blocker_id: IDS.viewer, blocked_id: IDS.blocked }],
    connection_archives: [],
    connection_hidden: [],
    connection_core: [],
    place_check_ins: [],
    place_pulses: [],
    nfc_anchors: [
      { id: IDS.anchor, venue_id: IDS.cafe, name: 'Counter', purpose: 'check_in', active: true, qr_token: IDS.anchorToken },
    ],
    hub_venues: [{ id: `place-${IDS.cafe}`, name: 'Café Allegro', place_id: IDS.cafe }],
    hub_participants: [],
    map_beacons: [],
    event_check_ins: [],
    connection_encounters: [],
    product_events: [],
  };
  for (const [name, rows] of Object.entries(options.extra ?? {})) tables[name] = [...(tables[name] ?? []), ...(rows ?? [])];

  return new FakeDb({
    tables,
    unique: {
      place_check_ins: [{ columns: ['user_id', 'place_id'], where: (r) => r.checked_out_at == null }],
    },
    defaults: {
      place_check_ins: (r) => ({ checked_out_at: null, checkout_reason: null, share_with_connections: false, ...r }),
      place_pulses: (r) => ({ created_at: new Date().toISOString(), ...r }),
    },
    rpc: {
      places_nearby: (args) => {
        const lat = Number(args.p_lat);
        const lng = Number(args.p_lng);
        const radius = Number(args.p_radius_meters);
        return (tables.places as Array<Record<string, unknown>>)
          .filter((p) => p.listed === true && p.verification_status === 'verified')
          .map((p) => ({ place_id: p.id, distance_meters: haversine(lat, lng, Number(p.latitude), Number(p.longitude)) }))
          .filter((h) => h.distance_meters <= radius)
          .sort((a, b) => a.distance_meters - b.distance_meters)
          .slice(0, Number(args.p_limit));
      },
    },
    ...options.db,
  });
}

export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

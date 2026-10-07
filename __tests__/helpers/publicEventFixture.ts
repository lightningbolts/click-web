import type { PublicEventPayload } from '@/lib/events/publicEvent';

/** A minimal public event; override only what a test is about. */
export function publicEventFixture(overrides: Partial<PublicEventPayload> = {}): PublicEventPayload {
  return {
    beacon_id: '11111111-2222-3333-4444-555555555555',
    title: 'Jazz night',
    description: null,
    image_url: null,
    host_name: 'Ava Stone',
    host_avatar_url: null,
    creator_id: 'host-1',
    event_start_at: '2026-10-08T02:00:00Z',
    event_end_at: '2026-10-08T05:00:00Z',
    latitude: 47.66,
    longitude: -122.31,
    location_name: 'Cafe Allegro',
    address: '4214 University Way NE',
    rsvp_count: 0,
    rsvp_enabled: true,
    expires_at: null,
    created_at: null,
    timezone: 'America/Los_Angeles',
    cover_theme_id: null,
    visual_seed: 'seed-1',
    attendees: [],
    listing: {} as PublicEventPayload['listing'],
    place: null,
    categories: [],
    venue_id: null,
    ...overrides,
  };
}

/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

import { loadPublicEventPayload } from '@/lib/events/publicEvent';
import { FakeDb } from '../../helpers/fakeSupabase';

const EVENT = '11111111-1111-4111-8111-111111111111';

function world(admission: 'rsvp' | 'ticketed') {
  return new FakeDb({
    tables: {
      map_beacons: [
        {
          id: EVENT,
          beacon_type: 'event',
          metadata: { title: 'Jazz night' },
          location: null,
          creator_id: 'host',
          show_creator_name: false,
          admission_type: admission,
          ticketing_status: 'sales_open',
          ticket_sales_start_at: null,
          ticket_sales_end_at: null,
          event_cancelled_at: null,
        },
      ],
      ticket_tiers: [
        { id: 't-ga', beacon_id: EVENT, name: 'GA', description: null, unit_amount: 2500, currency: 'usd', capacity: 50, max_per_order: 8, max_per_user: null, sales_start_at: null, sales_end_at: null, sort_order: 1, is_active: true, archived_at: null },
        { id: 't-early', beacon_id: EVENT, name: 'Early', description: null, unit_amount: 1200, currency: 'usd', capacity: 20, max_per_order: 8, max_per_user: null, sales_start_at: null, sales_end_at: null, sort_order: 0, is_active: true, archived_at: null },
      ],
      beacon_attendees: [],
      event_guest_rsvps: [],
    },
    rpc: { ticketing_tier_counts: () => [] },
  });
}

describe('public event payload ticketing', () => {
  const ORIGINAL = process.env.TICKETING_ENABLED;
  afterEach(() => {
    process.env.TICKETING_ENABLED = ORIGINAL;
  });

  it('summarizes ticketed events', async () => {
    process.env.TICKETING_ENABLED = 'true';
    const payload = await loadPublicEventPayload(world('ticketed').client as never, EVENT);
    expect(payload?.ticketing).toEqual({
      status: 'sales_open',
      cancelled: false,
      from_amount: 1200,
      currency: 'usd',
      available: true,
    });
  });

  it('is null for RSVP events', async () => {
    process.env.TICKETING_ENABLED = 'true';
    const payload = await loadPublicEventPayload(world('rsvp').client as never, EVENT);
    expect(payload?.ticketing).toBeNull();
  });

  it('is null while ticketing is off', async () => {
    process.env.TICKETING_ENABLED = 'false';
    const db = world('ticketed');
    const payload = await loadPublicEventPayload(db.client as never, EVENT);
    expect(payload?.ticketing).toBeNull();
    expect(db.log.some((entry) => entry.table === 'ticket_tiers')).toBe(false);
  });
});

import fs from 'fs';
import path from 'path';

describe('event hub backfill migration', () => {
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20260915023000_backfill_event_hubs_and_align_rsvp_rls.sql',
    ),
    'utf8',
  );

  it('backfills only event beacons without a canonical hub', () => {
    expect(migration).toContain("mb.beacon_type = 'event'");
    expect(migration).toContain('NOT EXISTS (');
    expect(migration).toContain('hv.event_beacon_id = mb.id');
    expect(migration).toContain("'hub_' || replace(gen_random_uuid()::text, '-', '')");
  });

  it('keeps both hub pointers and compatibility participants synchronized', () => {
    expect(migration).toContain('SET\n    hub_id = hv.id');
    expect(migration).toContain("'{hub_id}'");
    expect(migration).toContain('INSERT INTO public.hub_participants');
    expect(migration).toContain('ON CONFLICT (hub_id, user_id) DO NOTHING');
  });

  it('authorizes current RSVPs at the database layer', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.auth_uid_in_hub');
    expect(migration).toContain('FROM public.beacon_attendees AS attendee');
    expect(migration).toContain('attendee.beacon_id = hub.event_beacon_id');
    expect(migration).toContain('attendee.user_id = auth.uid()');
  });
});

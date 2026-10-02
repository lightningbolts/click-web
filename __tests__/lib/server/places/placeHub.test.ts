/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';
import { placeHubDisabledResponse } from '@/lib/server/places/placeHub';
import { FakeDb } from '../../../helpers/fakeSupabase';

function db(hubEnabled: boolean) {
  return new FakeDb({
    tables: {
      hub_venues: [
        { id: 'place-p1', place_id: 'p1' },
        { id: 'hub_standalone', place_id: null },
      ],
      places: [{ id: 'p1', hub_enabled: hubEnabled }],
    },
  });
}

describe('placeHubDisabledResponse', () => {
  it('refuses a Place Hub whose Place turned its hub off with 410 hub_disabled', async () => {
    const res = await placeHubDisabledResponse(db(false).client as unknown as SupabaseClient, 'place-p1');
    expect(res?.status).toBe(410);
    expect(await res?.json()).toEqual({ error: 'This Place Hub is turned off', code: 'hub_disabled' });
  });

  it('allows enabled Place Hubs and standalone hubs', async () => {
    expect(await placeHubDisabledResponse(db(true).client as unknown as SupabaseClient, 'place-p1')).toBeNull();
    expect(await placeHubDisabledResponse(db(false).client as unknown as SupabaseClient, 'hub_standalone')).toBeNull();
  });

  it('fails open when the lookup errors', async () => {
    const broken = new FakeDb({ failTables: { hub_venues: 'down' } });
    expect(await placeHubDisabledResponse(broken.client as unknown as SupabaseClient, 'place-p1')).toBeNull();
  });
});

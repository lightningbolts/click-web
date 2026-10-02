/** @jest-environment node */

import { createVenueForCheckout } from '@/app/business/actions';
import { makeSupabaseMock, type QueryResult } from '../../helpers/supabaseRouteMocks';

const mockGetUser = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
}));

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock('@/lib/server/stripe', () => ({
  getAppBaseUrl: () => 'http://localhost:3000',
  getStripe: () => {
    throw new Error('not used');
  },
}));

const USER_ID = 'user-owner-1';
const PLACE_ID = 'place-new-1';

function setupAdmin(managers: QueryResult = { data: null, error: null }) {
  const mock = makeSupabaseMock({
    tables: {
      places: { data: { id: PLACE_ID }, error: null },
      place_managers: managers,
    },
  });
  mockCreateAdminSupabaseClient.mockReturnValue(mock.supabase);
  return mock;
}

describe('createVenueForCheckout (business signup)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it('inserts the Place with the service role and only the forced columns', async () => {
    const mock = setupAdmin();

    const result = await createVenueForCheckout('token', '  Café Allegro ', ' 4214 University Way ');

    expect(result).toEqual({ ok: true, data: { venueId: PLACE_ID } });
    expect(mock.builder('places').insert).toHaveBeenCalledWith({
      name: 'Café Allegro',
      location: '4214 University Way',
      subscription_status: 'inactive',
    });
    expect(mock.builder('place_managers').insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      place_id: PLACE_ID,
      role: 'owner',
    });
  });

  it('deletes the Place when the owner row cannot be written', async () => {
    const mock = setupAdmin({ data: null, error: { message: 'manager insert failed' } });

    const result = await createVenueForCheckout('token', 'Café Allegro', '');

    expect(result).toEqual({ ok: false, error: 'manager insert failed' });
    const places = mock.builder('places');
    expect(places.delete).toHaveBeenCalled();
    expect(places.calls.eq).toContainEqual(['id', PLACE_ID]);
  });

  it('refuses unauthenticated callers before touching the database', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const mock = setupAdmin();

    const result = await createVenueForCheckout('bad', 'Café Allegro', '');

    expect(result.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});

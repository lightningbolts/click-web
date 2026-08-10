import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

const mockGetSupabaseFromRouteRequest = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

function buildMockRequest(overrides: { bearerToken?: string | null } = {}): any {
  const { bearerToken } = overrides;
  return {
    headers: {
      get: (name: string) => {
        if (name === 'authorization' && bearerToken) return `Bearer ${bearerToken}`;
        if (name === 'Authorization' && bearerToken) return `Bearer ${bearerToken}`;
        return null;
      },
    },
    cookies: {
      get: () => undefined,
    },
  };
}

describe('getAuthenticatedSupabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null user when route auth fails', async () => {
    const supabase = { auth: {} };
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      user: null,
      supabase,
      authError: new Error('Unauthorized'),
    });

    const result = await getAuthenticatedSupabase(buildMockRequest({ bearerToken: 'x' }));
    expect(result.user).toBeNull();
    expect(result.token).toBe('x');
    expect(result.supabase).toBe(supabase);
  });

  it('returns the authenticated user from route auth (bearer preferred)', async () => {
    const fakeUser = { id: 'user-1', email: 'test@example.com' };
    const supabase = { auth: {} };
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      user: fakeUser,
      supabase,
      authError: null,
    });

    const result = await getAuthenticatedSupabase(
      buildMockRequest({ bearerToken: 'valid-token-abc' }),
    );

    expect(result.token).toBe('valid-token-abc');
    expect(result.user).toEqual(fakeUser);
    expect(result.supabase).toBe(supabase);
    expect(mockGetSupabaseFromRouteRequest).toHaveBeenCalledTimes(1);
  });

  it('works with cookie-only sessions (no bearer token)', async () => {
    const fakeUser = { id: 'user-2', email: 'cookie@example.com' };
    const supabase = { auth: {} };
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      user: fakeUser,
      supabase,
      authError: null,
    });

    const result = await getAuthenticatedSupabase(buildMockRequest());
    expect(result.token).toBeNull();
    expect(result.user).toEqual(fakeUser);
  });
});

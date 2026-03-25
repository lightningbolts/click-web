import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

const mockGetUser = jest.fn();
const mockCreateClient = jest.fn(() => ({
  auth: { getUser: mockGetUser },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

function buildMockRequest(overrides: {
  bearerToken?: string | null;
  cookieToken?: string | null;
} = {}): any {
  const { bearerToken, cookieToken } = overrides;
  return {
    headers: {
      get: (name: string) => {
        if (name === 'Authorization' && bearerToken) return `Bearer ${bearerToken}`;
        return null;
      },
    },
    cookies: {
      get: (name: string) => {
        if (
          (name === 'sb-access-token' || name === 'sb-lrgcwnmcscimkmslihxp-auth-token') &&
          cookieToken
        ) {
          return { value: cookieToken };
        }
        return undefined;
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('getAuthenticatedSupabase', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ---------- No token ---------- */

  it('returns null user when no token is present', async () => {
    const req = buildMockRequest();
    const result = await getAuthenticatedSupabase(req);

    expect(result.token).toBeNull();
    expect(result.user).toBeNull();
    expect(result.supabase).toBeDefined();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  /* ---------- Bearer token — success ---------- */

  it('returns the authenticated user when a valid bearer token is provided', async () => {
    const fakeUser = { id: 'user-1', email: 'test@example.com' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser },
      error: null,
    });

    const req = buildMockRequest({ bearerToken: 'valid-token-abc' });
    const result = await getAuthenticatedSupabase(req);

    expect(result.token).toBe('valid-token-abc');
    expect(result.user).toEqual(fakeUser);
    expect(mockGetUser).toHaveBeenCalledWith('valid-token-abc');
  });

  /* ---------- Cookie token — success ---------- */

  it('reads the token from a cookie when no Authorization header is present', async () => {
    const fakeUser = { id: 'user-2', email: 'cookie@example.com' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser },
      error: null,
    });

    const req = buildMockRequest({ cookieToken: 'cookie-token-xyz' });
    const result = await getAuthenticatedSupabase(req);

    expect(result.token).toBe('cookie-token-xyz');
    expect(result.user).toEqual(fakeUser);
  });

  /* ---------- Supabase returns an error ---------- */

  it('returns null user when Supabase returns an auth error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Token expired', status: 401 },
    });

    const req = buildMockRequest({ bearerToken: 'expired-token' });
    const result = await getAuthenticatedSupabase(req);

    expect(result.token).toBe('expired-token');
    expect(result.user).toBeNull();
  });

  /* ---------- Supabase returns no user (but no error) ---------- */

  it('returns null user when getUser returns null user without an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const req = buildMockRequest({ bearerToken: 'bad-token' });
    const result = await getAuthenticatedSupabase(req);

    expect(result.token).toBe('bad-token');
    expect(result.user).toBeNull();
  });

  /* ---------- Supabase client is always returned ---------- */

  it('always returns a supabase client even on auth failures', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Unknown error' },
    });

    const req = buildMockRequest({ bearerToken: 'any-token' });
    const result = await getAuthenticatedSupabase(req);

    expect(result.supabase).toBeDefined();
    expect(typeof result.supabase.auth.getUser).toBe('function');
  });

  /* ---------- Creates client with correct arguments ---------- */

  it('creates a Supabase client with the correct URL and key', async () => {
    const req = buildMockRequest();
    await getAuthenticatedSupabase(req);

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        auth: { persistSession: false },
      }),
    );
  });

  it('passes the bearer token in the global headers when present', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const req = buildMockRequest({ bearerToken: 'some-token' });
    await getAuthenticatedSupabase(req);

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        global: {
          headers: { Authorization: 'Bearer some-token' },
        },
      }),
    );
  });

  /* ---------- Cookie takes priority over bearer ---------- */

  it('prefers cookie token over Authorization header', async () => {
    const fakeUser = { id: 'user-cookie', email: 'priority@example.com' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser },
      error: null,
    });

    const req = buildMockRequest({
      cookieToken: 'cookie-wins',
      bearerToken: 'header-loses',
    });

    const result = await getAuthenticatedSupabase(req);
    expect(result.token).toBe('cookie-wins');
  });
});

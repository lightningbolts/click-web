import {
  authFailureMessage,
  getFreshAuthHeaders,
  resetFreshAuthHeadersForTests,
} from '@/lib/auth/freshAuthHeaders';

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
  }),
}));

function sessionWithExpiry(expiresAtSec: number) {
  return {
    access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig',
    expires_at: expiresAtSec,
  };
}

describe('freshAuthHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFreshAuthHeadersForTests();
  });

  it('authFailureMessage maps 401/403 to session expired', () => {
    expect(authFailureMessage(401, 'Failed to load chat')).toBe('Session expired. Sign in again.');
    expect(authFailureMessage(403, 'nope')).toBe('Session expired. Sign in again.');
    expect(authFailureMessage(500, 'boom')).toBe('boom');
  });

  it('skips refresh when access token has headroom', async () => {
    const far = Math.floor(Date.now() / 1000) + 600;
    mockGetSession.mockResolvedValue({ data: { session: sessionWithExpiry(far) } });

    const headers = await getFreshAuthHeaders();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect((headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it('single-flights refresh when near expiry', async () => {
    const near = Math.floor(Date.now() / 1000) + 30;
    let resolveRefresh: (() => void) | undefined;
    let refreshStarted = 0;
    mockGetSession.mockResolvedValue({ data: { session: sessionWithExpiry(near) } });
    mockRefreshSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          refreshStarted += 1;
          resolveRefresh = () => {
            mockGetSession.mockResolvedValue({
              data: { session: sessionWithExpiry(farFuture()) },
            });
            resolve({ data: { session: sessionWithExpiry(farFuture()) } });
          };
        }),
    );

    const p1 = getFreshAuthHeaders();
    const p2 = getFreshAuthHeaders();
    // Allow both callers to reach the shared refresh gate.
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshStarted).toBe(1);
    resolveRefresh?.();
    await Promise.all([p1, p2]);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });
});

function farFuture() {
  return Math.floor(Date.now() / 1000) + 600;
}

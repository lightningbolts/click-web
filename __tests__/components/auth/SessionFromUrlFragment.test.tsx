import { render, waitFor } from '@testing-library/react';
import { SessionFromUrlFragment, sessionFromFragment } from '@/components/auth/SessionFromUrlFragment';

const refresh = jest.fn();
const setSession = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { setSession } }) }));

describe('sessionFromFragment', () => {
  it('reads the tokens from an email-link fragment', () => {
    expect(sessionFromFragment('#access_token=a&expires_in=3600&refresh_token=r&type=invite')).toEqual({
      access_token: 'a',
      refresh_token: 'r',
    });
  });

  it('ignores fragments without both tokens', () => {
    expect(sessionFromFragment('#error=access_denied&error_description=Email+link+is+invalid')).toBeNull();
    expect(sessionFromFragment('#access_token=a')).toBeNull();
    expect(sessionFromFragment('')).toBeNull();
  });
});

describe('SessionFromUrlFragment', () => {
  beforeEach(() => {
    refresh.mockReset();
    setSession.mockReset().mockResolvedValue({ error: null });
  });

  it('signs in from an invite link, cleans the URL and re-renders', async () => {
    window.history.replaceState(null, '', '/login?next=%2Fbusiness%2Finvite%2Ftok#access_token=a&refresh_token=r&type=invite');
    render(<SessionFromUrlFragment />);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?next=%2Fbusiness%2Finvite%2Ftok');
  });

  it('leaves device-approval links alone', () => {
    window.history.replaceState(null, '', '/devices/approve/req#access_token=a&refresh_token=r');
    render(<SessionFromUrlFragment />);
    expect(setSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#access_token=a&refresh_token=r');
  });
});

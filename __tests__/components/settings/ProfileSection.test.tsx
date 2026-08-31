import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSection from '@/components/settings/ProfileSection';

const mockRefreshUser = jest.fn();
const mockSetProfileImageUrl = jest.fn();

jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'ada@example.com', user_metadata: {} },
    refreshUser: mockRefreshUser,
    profileImageUrl: null,
    setProfileImageUrl: mockSetProfileImageUrl,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { updateUser: jest.fn() },
  }),
}));

jest.mock('@/lib/auth/freshAuthHeaders', () => ({
  getFreshAuthHeaders: async () => ({ 'Content-Type': 'application/json' }),
  fetchWithFreshAuth: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  authFailureMessage: (status: number, fallback: string) =>
    status === 401 || status === 403 ? 'Session expired. Sign in again.' : fallback,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ProfileSection avatar upload', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRefreshUser.mockReset();
    mockSetProfileImageUrl.mockReset();
  });

  it('uploads through /api/user/avatar and shows inline errors', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Storage upload failed' }),
    });

    render(
      <ProfileSection
        firstName="Ada"
        lastName="Lovelace"
        setFirstName={jest.fn()}
        setLastName={jest.fn()}
        accountDisplayName="Ada Lovelace"
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(1200)], 'avatar.png', { type: 'image/png' });
    await user.upload(input, file);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/user/avatar',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage upload failed');
  });
});

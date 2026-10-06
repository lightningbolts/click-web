import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { PersonalitySettings } from '@/components/settings/PersonalitySettings';
import { InterestsSettings } from '@/components/settings/InterestsSettings';
import { orderDevices } from '@/components/settings/DevicesSettings';
import { SETTINGS_SECTIONS, settingsSection } from '@/lib/settings/sections';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn() }), usePathname: () => '/settings/profile' }));
const updateUser = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { updateUser } }) }));
jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: {} }, refreshUser: jest.fn(), setProfileImageUrl: jest.fn() }),
}));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));
jest.mock('@/components/app-shell/ShellContext', () => ({ PushedPage: () => null }));
const toastSuccess = jest.fn();
jest.mock('@/components/ds/Toast', () => ({ toast: { success: (m: string) => toastSuccess(m), error: jest.fn() } }));

const mockFetch = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe('settings sections (spec §7.8)', () => {
  it('has a unique, deep-linkable id for every section', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['profile', 'interests', 'personality', 'notifications', 'privacy', 'devices', 'blocked', 'account', 'appearance']);
    expect(settingsSection('nope')).toBeNull();
  });

  describe('Profile', () => {
    const initial = { firstName: 'Ada', lastName: 'Lovelace', bio: '', birthday: null, image: null };

    it('shows the save bar only when dirty, and Discard restores', async () => {
      render(<ProfileSettings userId="u1" initial={initial} />);
      expect(screen.queryByTestId('settings-save-bar')).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Bio'), 'Hi');
      expect(screen.getByTestId('settings-save-bar')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(screen.getByLabelText('Bio')).toHaveValue('');
      expect(screen.queryByTestId('settings-save-bar')).not.toBeInTheDocument();
    });

    it('saves name and bio through the profile API and auth metadata', async () => {
      render(<ProfileSettings userId="u1" initial={initial} />);
      await userEvent.type(screen.getByLabelText('Bio'), 'Loves engines');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Profile saved'));
      const call = mockFetch.mock.calls.find((c) => String(c[0]) === '/api/users/u1/profile')!;
      expect(bodyOf(call)).toEqual({ first_name: 'Ada', last_name: 'Lovelace', bio: 'Loves engines' });
      expect(updateUser).toHaveBeenCalledWith({ data: { first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace', name: 'Ada Lovelace' } });
      expect(screen.queryByTestId('settings-save-bar')).not.toBeInTheDocument();
    });

    it('requires a first name', async () => {
      render(<ProfileSettings userId="u1" initial={initial} />);
      await userEvent.clear(screen.getByLabelText(/First name/));
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('Add your first name.')).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('Personality caps picks at five and saves exactly five', async () => {
    render(<PersonalitySettings userId="u1" initial={['Warm', 'Bold', 'Curious', 'Witty']} />);
    expect(screen.getByText(/4 of 5/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chill' }));
    expect(screen.getByRole('button', { name: 'Grounded' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(bodyOf(mockFetch.mock.calls[0]).personality_tags).toEqual(['Warm', 'Bold', 'Curious', 'Witty', 'Chill']);
  });

  it('Interests asks for more until the minimum and blocks saving below it', async () => {
    render(<InterestsSettings userId="u1" initial={['Music']} />);
    expect(screen.getByText('Pick 2 more')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Coffee/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Espresso' }));
    expect(screen.getByText('Pick 1 more')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Latte Art' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('lists this browser first among devices', () => {
    const d = (id: string) => ({ device_id: id, label: id, created_at: '2026-01-01T00:00:00Z', last_seen_at: null });
    expect(orderDevices([d('a'), d('b'), d('c')], 'b').map((x) => x.device_id)).toEqual(['b', 'a', 'c']);
  });
});

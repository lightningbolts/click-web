import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { RecapCard } from '@/components/home/RecapCard';
import type { ActivityRecap } from '@/lib/me/activityRecap';
import CommunityHubs from '@/components/dashboard/CommunityHubs';
import { resolveWebHubE2eeV2Session } from '@/lib/chat/e2eeV2Client';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer test' }) }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => null }));
jest.mock('@/components/UserProfileModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({
  resolveWebHubE2eeV2Session: jest.fn(), encryptWebE2eeV2Message: jest.fn(), decryptWebE2eeV2Message: jest.fn(),
}));
const originalFetch = global.fetch;
function mount(component: React.ReactNode) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{component}</SWRConfig>);
}
function response(body: unknown, ok = true) { return { ok, json: async () => body } as Response; }
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

const recap = (window: 'day' | 'week', connections_formed: number): ActivityRecap => ({
  window, since: '2026-10-01T00:00:00.000Z', connections_formed, messages_sent: 0, messages_received: 0,
  beacons_created: 0, events_rsvped: 0, events_checked_in: 0, events_saved: 0,
});

test('switches recap windows from server data without refetching', () => {
  global.fetch = jest.fn();
  mount(<RecapCard recap={{ day: recap('day', 2), week: recap('week', 5) }} />);
  expect(screen.getByText('5')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Day' }));
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('shows a calm empty recap', () => {
  mount(<RecapCard recap={{ day: recap('day', 0), week: recap('week', 0) }} />);
  expect(screen.getByText(/A quiet week so far/)).toBeInTheDocument();
});

test('does not ask for location before the user chooses nearby discovery', async () => {
  const getCurrentPosition = jest.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  mount(<CommunityHubs userId="user-1" />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Find nearby hubs' }));
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test('retains the draft and never falls back to plaintext when hub key resolution fails', async () => {
  global.fetch = jest.fn(async (url) => String(url).includes('/messages?')
    ? response({ messages: [], participant_ids: ['user-1'], occupant_count: 1 })
    : response({ hub: { id: 'hub-1', name: 'Event room', category: 'event', event_beacon_id: 'event-1' } }));
  jest.mocked(resolveWebHubE2eeV2Session).mockRejectedValue(new Error('Device not approved'));
  mount(<CommunityHubs userId="user-1" initialHubId="hub-1" />);
  await screen.findByText('No messages yet. Say hello to the room.');
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Private message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Private message');
  expect(jest.mocked(global.fetch).mock.calls.some(([url, options]) => String(url) === '/api/hub/messages' && options?.method === 'POST')).toBe(false);
});

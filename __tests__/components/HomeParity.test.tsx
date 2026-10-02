import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import HomeActivityRecap from '@/components/dashboard/HomeActivityRecap';
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

test('keeps the previous recap correctly labelled while changing windows', async () => {
  let resolveDay!: (value: Response) => void;
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('window=day')) return new Promise<Response>((resolve) => { resolveDay = resolve; });
    return response({ recap: { window: 'week', connections_formed: 5, messages_sent: 0, messages_received: 0, beacons_created: 0, events_rsvped: 0, events_checked_in: 0, events_saved: 0 } });
  });
  mount(<HomeActivityRecap userId="user-1" />);
  await screen.findByText('5');
  fireEvent.click(screen.getByRole('button', { name: 'Day' }));
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.getByText(/Past 7 days/)).toBeInTheDocument();
  await waitFor(() => expect(resolveDay).toBeDefined());
  resolveDay(response({ recap: { window: 'day', connections_formed: 2, messages_sent: 0, messages_received: 0, beacons_created: 0, events_rsvped: 0, events_checked_in: 0, events_saved: 0 } }));
  await screen.findByText('Past 24 hours');
  expect(screen.getByText('2')).toBeInTheDocument();
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

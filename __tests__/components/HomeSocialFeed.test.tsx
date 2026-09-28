import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import HomeSocialFeed from '@/components/dashboard/HomeSocialFeed';
import HomeSavedEvents from '@/components/dashboard/HomeSavedEvents';
import type { HomeNudge } from '@/lib/dashboard/homeFeed';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer test' }) }));
const originalFetch = global.fetch;
const now = new Date(2026, 8, 27, 12).getTime();
const nudge: HomeNudge = { id: 'n1', nudge_type: 'hangout_confirm', connection_id: 'c1', beacon_id: null, headline: 'Confirm your hangout', body: 'Were you together?', payload: { confirmation_id: 'h1' } };
function response(body: unknown, ok = true, status = 200) { return { ok, status, json: async () => body } as Response; }
function mount(component: React.ReactNode) { return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{component}</SWRConfig>); }
function feed() { return <HomeSocialFeed userId="u1" name="Lena" now={now} connections={[]} onOpenChat={jest.fn()} onOpenProfile={jest.fn()}><div>Plans</div></HomeSocialFeed>; }
beforeEach(() => {
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: jest.fn(async () => ({ state: 'prompt', addEventListener: jest.fn(), removeEventListener: jest.fn() })) } });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: jest.fn() } });
});
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });
function mockFeed(post: (url: string) => Promise<Response>) {
  global.fetch = jest.fn(async (url, options) => {
    if (options?.method === 'POST') return post(String(url));
    if (String(url).includes('/nudges')) return response({ nudges: [nudge] });
    if (String(url).includes('bookmarks')) return response({ bookmarks: [], next_cursor: null });
    return response({ recap: { window: 'week', connections_formed: 0, messages_sent: 0, messages_received: 0, beacons_created: 0, events_rsvped: 0, events_checked_in: 0, events_saved: 0 } });
  });
}

test('retains failed dismissals and never requests a new location permission on Home', async () => {
  mockFeed(async () => response({ error: 'Try again later' }, false, 500));
  mount(feed());
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
  await screen.findByText('Try again later');
  expect(screen.getByText('Confirm your hangout')).toBeInTheDocument();
  expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('/api/beacons'))).toBe(false);
});

test('accepts empty 204 declines and prunes the resolved prompt', async () => {
  mockFeed(async () => ({ ok: true, status: 204, json: jest.fn(() => { throw new Error('Empty response'); }) }) as unknown as Response);
  mount(feed());
  fireEvent.click(await screen.findByRole('button', { name: 'We weren’t together' }));
  await screen.findByText('Hangout declined. Nothing was added to your timeline.');
  expect(screen.queryByText('Confirm your hangout')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/hangouts/h1/decline', expect.objectContaining({ method: 'POST' }));
});

test('a one-sided confirmation says waiting, not logged', async () => {
  mockFeed(async () => response({ status: 'waiting', already_logged: false }));
  mount(feed());
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm hangout' }));
  await screen.findByText('Confirmed. It will be added once you both confirm.');
  expect(screen.queryByText('Added to your shared timeline.')).not.toBeInTheDocument();
});

test('saved events disable unavailable links, separate past events, and load another page', async () => {
  const event = { beacon_id: 'future', title: 'Tomorrow', created_at: new Date(now).toISOString(), event_start_at: new Date(now + 86_400_000).toISOString(), event_end_at: new Date(now + 90_000_000).toISOString(), location_name: 'Park' };
  global.fetch = jest.fn(async (url) => String(url).includes('cursor=') ? response({ bookmarks: [{ ...event, beacon_id: 'older', title: 'Older bookmark' }], next_cursor: null }) : response({ bookmarks: [event, { ...event, beacon_id: 'deleted', title: 'Unavailable event', created_at: null }, { ...event, beacon_id: 'past', title: 'Yesterday', event_start_at: new Date(now - 86_400_000).toISOString(), event_end_at: new Date(now - 3_600_000).toISOString() }], next_cursor: 'cursor-value' }));
  mount(<HomeSavedEvents userId="u1" now={now} />);
  expect(await screen.findByRole('link', { name: /Tomorrow/ })).toHaveAttribute('href', '/e/future');
  expect(screen.queryByRole('link', { name: /Unavailable event/ })).not.toBeInTheDocument();
  const past = screen.getByText('Past & unavailable (2)').parentElement!;
  expect(within(past).getByText('Yesterday')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more saved events' }));
  await screen.findByRole('link', { name: /Older bookmark/ });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more saved events' })).not.toBeInTheDocument());
  expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('cursor=cursor-value'))).toBe(true);
});

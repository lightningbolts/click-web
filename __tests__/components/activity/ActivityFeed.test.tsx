import { render, screen, waitFor } from '@testing-library/react';
import { mutate } from 'swr';
import { ActivityFeed } from '@/components/activity/ActivityFeed';
import type { ActivityPage } from '@/components/activity/activityData';
import type { ActivityRowItem } from '@/components/activity/ActivityRow';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));

const NOW = Date.parse('2026-10-08T18:00:00Z');
const row = (id: string, title: string, iso: string): ActivityRowItem => ({ id, type: 'reaction', title, body: '', data: {}, created_at: iso, actor: null });
const page = (items: ActivityRowItem[]): ActivityPage => ({
  items,
  seen_at: '2026-10-08T17:30:00Z',
  next_before: null,
  pending_requests: [],
});

describe('ActivityFeed live updates', () => {
  it('puts an item that arrives while the page is open under New, and marks it seen', async () => {
    const rendered = page([row('a', 'Sam reacted to your drop', '2026-10-08T17:00:00Z')]);
    const live = page([row('b', 'Maya reacted to your drop', '2026-10-08T17:59:00Z'), ...rendered.items]);
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.startsWith('/api/activity/seen') ? { ok: true } : live),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ActivityFeed initial={rendered} nowMs={NOW} timeZone="UTC" />);
    expect(screen.queryByText('Maya reacted to your drop')).not.toBeInTheDocument();

    // A live hint refetches the latest page (what `LiveActivity` does).
    await mutate('/api/activity');
    const newSection = await screen.findByRole('region', { name: 'New' });
    expect(newSection).toHaveTextContent('Maya reacted to your drop');
    expect(screen.getByText('Sam reacted to your drop')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/activity/seen',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ seen_at: '2026-10-08T17:59:00Z' }) }),
      ),
    );
  });
});

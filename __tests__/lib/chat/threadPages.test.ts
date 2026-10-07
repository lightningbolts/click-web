import { fetchThreadPage, takeWarmThreadFirstPage, warmThreadFirstPage } from '@/lib/chat/threadPages';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({
  getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
  authFailureMessage: (_status: number, fallback: string) => fallback,
}));

const row = (id: string) => ({ id, chat_id: 'chat1', user_id: 'u', content: id, created_at: '2026-10-07T00:00:00Z' });

describe('threadPages', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ messages: [row('m2'), row('m1')] }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('fetches a page oldest first', async () => {
    const page = await fetchThreadPage('chat1');
    expect(page.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/messages?chatId=chat1&limit=40');
  });

  it('warms once, hands the page over once, and only while fresh', async () => {
    warmThreadFirstPage('chat1', 1_000);
    warmThreadFirstPage('chat1', 2_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const page = takeWarmThreadFirstPage('chat1', 5_000);
    await expect(page).resolves.toHaveLength(2);
    expect(takeWarmThreadFirstPage('chat1', 5_000)).toBeNull();

    warmThreadFirstPage('chat2', 1_000);
    expect(takeWarmThreadFirstPage('chat2', 20_000)).toBeNull();
  });

  it('drops a failed warm-up so the thread fetches itself', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    warmThreadFirstPage('chat3', 1_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(takeWarmThreadFirstPage('chat3', 1_500)).toBeNull();
  });
});

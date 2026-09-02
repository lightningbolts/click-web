/**
 * @jest-environment node
 */

import {
  HUB_NOTIFICATION_AUTH_CONCURRENCY,
  notifyHubMessageParticipants,
} from '@/lib/hub/notifyHubMessage';

const mockAssertHubReadable = jest.fn();

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

describe('notifyHubMessageParticipants', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockAssertHubReadable.mockReset();
    mockAssertHubReadable.mockResolvedValue(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('posts to every participant except the sender', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: 'sender' }, { user_id: 'peer-1' }, { user_id: 'peer-2' }],
          error: null,
        }),
      }),
    });

    const sent = await notifyHubMessageParticipants({
      admin: { from } as never,
      hubId: 'hub-1',
      messageId: 'msg-1',
      senderUserId: 'sender',
    });

    expect(sent).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((b: { recipient_user_id: string }) => b.recipient_user_id).sort()).toEqual([
      'peer-1',
      'peer-2',
    ]);
    expect(bodies[0].data.type).toBe('hub_message');
    expect(bodies.every((body: { body: string }) => body.body === 'Open Click to view it.')).toBe(true);
    expect(JSON.stringify(bodies)).not.toContain('hello hub');
  });

  it('does not notify a stale participant denied by the authoritative hub gate', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockAssertHubReadable.mockImplementation(
      async (_admin: unknown, _hubId: string, userId: string) =>
        userId === 'checked-out' ? new Response(null, { status: 403 }) : null,
    );
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: 'sender' }, { user_id: 'active' }, { user_id: 'checked-out' }],
          error: null,
        }),
      }),
    });

    const sent = await notifyHubMessageParticipants({
      admin: { from } as never,
      hubId: 'hub-1',
      messageId: 'msg-1',
      senderUserId: 'sender',
    });

    expect(sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).recipient_user_id).toBe('active');
  });

  it('bounds concurrent authorization checks for large hubs', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    let activeChecks = 0;
    let maximumActiveChecks = 0;
    mockAssertHubReadable.mockImplementation(async () => {
      activeChecks += 1;
      maximumActiveChecks = Math.max(maximumActiveChecks, activeChecks);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeChecks -= 1;
      return null;
    });
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: Array.from({ length: HUB_NOTIFICATION_AUTH_CONCURRENCY * 2 }, (_, index) => ({
            user_id: `peer-${index}`,
          })),
          error: null,
        }),
      }),
    });

    const sent = await notifyHubMessageParticipants({
      admin: { from } as never,
      hubId: 'hub-1',
      messageId: 'msg-1',
      senderUserId: 'sender',
    });

    expect(sent).toBe(HUB_NOTIFICATION_AUTH_CONCURRENCY * 2);
    expect(maximumActiveChecks).toBeLessThanOrEqual(HUB_NOTIFICATION_AUTH_CONCURRENCY);
  });
});

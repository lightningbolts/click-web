/**
 * @jest-environment node
 */

import { notifyHubMessageParticipants } from '@/lib/hub/notifyHubMessage';

describe('notifyHubMessageParticipants', () => {
  const originalFetch = global.fetch;

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
      preview: 'hello hub',
    });

    expect(sent).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((b: { recipient_user_id: string }) => b.recipient_user_id).sort()).toEqual([
      'peer-1',
      'peer-2',
    ]);
    expect(bodies[0].data.type).toBe('hub_message');
  });
});

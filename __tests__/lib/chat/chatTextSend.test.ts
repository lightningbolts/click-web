import { postChatText, sendDirectText } from '@/lib/chat/chatTextSend';
import { deriveKeysForConnection, encryptContent } from '@/lib/chat/crypto';
import { encryptWebE2eeV2Message, invalidateWebE2eeV2Session, resolveWebE2eeV2Session } from '@/lib/chat/e2eeV2Client';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({
  resolveWebE2eeV2Session: jest.fn(),
  encryptWebE2eeV2Message: jest.fn(),
  invalidateWebE2eeV2Session: jest.fn(),
}));
jest.mock('@/lib/chat/crypto', () => ({
  deriveKeysForConnection: jest.fn(async () => ({ keys: true })),
  encryptContent: jest.fn(async (text: string) => `e2e:${text}`),
  encryptGroupMessageContent: jest.fn(),
}));

function json(status: number, body: unknown): Response {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body, clone: () => res };
  return res as unknown as Response;
}
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('postChatText', () => {
  it('re-reads the keys and sends once more when the server says the epoch went stale', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(json(409, { code: 'E2EE_V2_INVALID' })).mockResolvedValueOnce(json(200, { id: 'm1' }));
    global.fetch = fetchMock;
    const build = jest.fn(async (staleOk: boolean) => ({ staleOk }));
    const res = await postChatText('chat-1', {}, build);
    expect(res.ok).toBe(true);
    expect(build.mock.calls).toEqual([[true], [false]]);
    expect(invalidateWebE2eeV2Session).toHaveBeenCalledWith('chat-1');
  });

  it('does not retry other failures', async () => {
    global.fetch = jest.fn().mockResolvedValue(json(409, { code: 'OTHER' }));
    const build = jest.fn(async () => ({}));
    expect((await postChatText('chat-1', {}, build)).status).toBe(409);
    expect(build).toHaveBeenCalledTimes(1);
  });
});

describe('sendDirectText', () => {
  it('encrypts into the 1-1 chat with v2 and carries the drop reply metadata', async () => {
    (resolveWebE2eeV2Session as jest.Mock).mockResolvedValue({ deviceId: 'dev' });
    (encryptWebE2eeV2Message as jest.Mock).mockResolvedValue({ wireContent: 'e2e2:xyz', metadata: { crypto_version: 2, epoch: 3 } });
    const fetchMock = jest.fn().mockResolvedValueOnce(json(200, { chat: { id: 'chat-9' } })).mockResolvedValueOnce(json(200, { id: 'm1' }));
    global.fetch = fetchMock;

    await sendDirectText({ connectionId: 'conn-1', viewerId: 'me', peerId: 'them', content: 'nice', metadata: { drop_reply: { kind: 'shared', id: 'd1', reaction: false } } });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat?connectionId=conn-1');
    expect(resolveWebE2eeV2Session).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'chat-9', participantUserIds: ['me', 'them'], allowUpgrade: true }));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({
      chatId: 'chat-9',
      connectionId: 'conn-1',
      content: 'e2e2:xyz',
      metadata: { drop_reply: { kind: 'shared', id: 'd1', reaction: false }, crypto_version: 2, epoch: 3 },
    });
  });

  it('falls back to the pairwise v1 keys without a v2 session', async () => {
    (resolveWebE2eeV2Session as jest.Mock).mockResolvedValue(null);
    const fetchMock = jest.fn().mockResolvedValueOnce(json(200, { chat: { id: 'chat-9' } })).mockResolvedValueOnce(json(200, { id: 'm1' }));
    global.fetch = fetchMock;
    await sendDirectText({ connectionId: 'conn-1', viewerId: 'me', peerId: 'them', content: '🔥' });
    expect(deriveKeysForConnection).toHaveBeenCalledWith('conn-1', ['me', 'them']);
    expect(encryptContent).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).content).toBe('e2e:🔥');
  });

  it('throws when the chat can’t be opened or the send fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(json(404, {}));
    await expect(sendDirectText({ connectionId: 'c', viewerId: 'me', peerId: 'them', content: 'x' })).rejects.toThrow();
    (resolveWebE2eeV2Session as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValueOnce(json(200, { chat: { id: 'chat-9' } })).mockResolvedValueOnce(json(500, {}));
    await expect(sendDirectText({ connectionId: 'c', viewerId: 'me', peerId: 'them', content: 'x' })).rejects.toThrow();
  });
});

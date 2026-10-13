import {
  encryptWebE2eeV2Message,
  invalidateWebE2eeV2Session,
  resolveWebE2eeV2Session,
} from '@/lib/chat/e2eeV2Client';
import { sendHubText } from '@/lib/hub/hubChatClient';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer test' }) }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => null }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({
  resolveWebE2eeV2Session: jest.fn(),
  invalidateWebE2eeV2Session: jest.fn(),
  encryptWebE2eeV2Message: jest.fn(),
  decryptWebE2eeV2ForDisplay: jest.fn(),
}));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

const row = { id: 'm1', hub_id: 'hub-1', user_id: 'u1', body: 'e2e2:new', created_at: '2026-10-13T00:00:00.000Z' };
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
const posted = () =>
  jest.mocked(global.fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { body: string; metadata: Record<string, unknown> });

describe('sendHubText', () => {
  beforeEach(() => {
    jest.mocked(resolveWebE2eeV2Session).mockResolvedValueOnce('old' as never).mockResolvedValueOnce('new' as never);
    jest.mocked(encryptWebE2eeV2Message).mockImplementation(async (session) => ({
      wireContent: `e2e2:${String(session)}`,
      metadata: { client_message_id: 'c1', e2ee_epoch: String(session) },
    }) as never);
  });

  it('sends with the cached keys, and once more with fresh ones when the hub has rotated', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(reply(400, { code: 'HUB_E2EE_V2_INVALID' }))
      .mockResolvedValueOnce(reply(201, { message: row }));

    await expect(sendHubText('hub-1', 'hi', ['u1', 'u2'], { clientMessageId: 'c1' })).resolves.toMatchObject({ id: 'm1' });
    expect(posted().map((p) => p.body)).toEqual(['e2e2:old', 'e2e2:new']);
    expect(invalidateWebE2eeV2Session).toHaveBeenCalledWith('hub-1', 'hub');
    // The first try may use stale keys; the retry may not.
    expect(jest.mocked(resolveWebE2eeV2Session).mock.calls.map(([o]) => o.staleWhileRevalidate)).toEqual([true, false]);
  });

  it('also retries when a new device needs the epoch rotated', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(reply(409, { code: 'HUB_E2EE_V2_REQUIRED' }))
      .mockResolvedValueOnce(reply(201, { message: row }));
    await expect(sendHubText('hub-1', 'hi', ['u1'])).resolves.toMatchObject({ id: 'm1' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry other refusals, and says why', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(reply(403, { message: 'You left this event.' }));
    await expect(sendHubText('hub-1', 'hi', ['u1'])).rejects.toThrow('You left this event.');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('never sends plaintext when the keys cannot be resolved', async () => {
    jest.mocked(resolveWebE2eeV2Session).mockReset().mockRejectedValue(new Error('Device not approved'));
    global.fetch = jest.fn();
    await expect(sendHubText('hub-1', 'hi', ['u1'])).rejects.toThrow('Device not approved');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

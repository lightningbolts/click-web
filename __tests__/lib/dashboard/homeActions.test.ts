import { contextualIcebreaker, sendHomeIcebreaker } from '@/lib/dashboard/homeActions';
import { hubRequest } from '@/lib/hub/client';
import { resolveWebE2eeV2Session, encryptWebE2eeV2Message } from '@/lib/chat/e2eeV2Client';
import { deriveKeysForConnection, encryptContent } from '@/lib/chat/crypto';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

jest.mock('@/lib/hub/client', () => ({ hubRequest: jest.fn() }));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: jest.fn() }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({ resolveWebE2eeV2Session: jest.fn(), encryptWebE2eeV2Message: jest.fn() }));
jest.mock('@/lib/chat/crypto', () => ({ deriveKeysForConnection: jest.fn(), encryptContent: jest.fn() }));
const connection: ConnectionRecord = { id: 'connection', name: 'Sam', userIds: ['me', 'peer'], dateMet: new Date(), location: 'Library', status: 'kept' };
beforeEach(() => { jest.resetAllMocks(); jest.mocked(hubRequest).mockResolvedValue({ chat: { id: 'chat' } }); });

test('selects a mobile prompt using the connection context', () => {
  expect(contextualIcebreaker(connection)).toBe("What's your go-to study spot on campus?");
});
test('does not send anything when current encryption keys cannot be resolved', async () => {
  jest.mocked(resolveWebE2eeV2Session).mockRejectedValue(new Error('Missing keys'));
  await expect(sendHomeIcebreaker(connection, 'me', 'Hello')).rejects.toThrow('Missing keys');
  expect(hubRequest).toHaveBeenCalledTimes(1);
  expect(encryptContent).not.toHaveBeenCalled();
});
test('sends ciphertext and v2 metadata', async () => {
  jest.mocked(resolveWebE2eeV2Session).mockResolvedValue({} as never);
  jest.mocked(encryptWebE2eeV2Message).mockResolvedValue({ wireContent: 'e2e2:ciphertext', metadata: { epoch: 1 } } as never);
  await sendHomeIcebreaker(connection, 'me', 'Hello');
  expect(hubRequest).toHaveBeenLastCalledWith('/api/chat/messages', expect.objectContaining({ content: 'e2e2:ciphertext', metadata: { epoch: 1 }, connectionId: 'connection' }));
});
test('legacy chats use encrypted pairwise messages', async () => {
  jest.mocked(resolveWebE2eeV2Session).mockResolvedValue(null);
  jest.mocked(deriveKeysForConnection).mockResolvedValue({} as never);
  jest.mocked(encryptContent).mockResolvedValue('e2e:encrypted');
  await sendHomeIcebreaker(connection, 'me', 'Hello');
  expect(hubRequest).toHaveBeenLastCalledWith('/api/chat/messages', expect.objectContaining({ content: 'e2e:encrypted' }));
});
test('rejects a connection belonging to a different account', async () => {
  await expect(sendHomeIcebreaker(connection, 'someone-else', 'Hello')).rejects.toThrow('not ready');
  expect(hubRequest).not.toHaveBeenCalled();
});

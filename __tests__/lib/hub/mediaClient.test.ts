import { uploadHubAttachment } from '@/lib/hub/mediaClient';
import { encryptWebE2eeV2Media, encryptWebE2eeV2Message, type E2eeV2Session } from '@/lib/chat/e2eeV2Client';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer test' }) }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({ encryptWebE2eeV2Media: jest.fn(), encryptWebE2eeV2Message: jest.fn() }));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

test('uploads ciphertext and binds the attachment to the encrypted message identity', async () => {
  const session = { currentEpoch: 4, deviceId: 'device' } as E2eeV2Session;
  const file = new File(['private contents'], 'private.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2]).buffer });
  jest.mocked(encryptWebE2eeV2Media).mockResolvedValue({ payload: new Uint8Array([8, 9]), authorizationEnvelope: 'authorization', metadata: {
    epoch: 4, sender_device_id: 'device', client_message_id: 'message', media_ciphertext_sha256: 'digest',
  } });
  jest.mocked(encryptWebE2eeV2Message).mockResolvedValue({ wireContent: 'encrypted filename', metadata: {} });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ path: 'path' }) } as Response));
  const result = await uploadHubAttachment({ file, session, hubId: 'hub-1', userId: 'user-1', coords: { user_lat: 47, user_long: -122 } });
  const form = jest.mocked(global.fetch).mock.calls[0][1]?.body as FormData;
  expect(form.get('e2ee_v2_envelope')).toBe('authorization');
  expect(form.get('mime_type')).toBe('application/octet-stream');
  expect((form.get('file') as File).size).toBe(2);
  expect(form.get('object_path')).toMatch(/^user-1\/hub\/hub-1\/.*\.enc$/);
  expect(result.body).toBe('encrypted filename');
  expect(result.metadata.media_epoch).toBe(4);
  expect(encryptWebE2eeV2Message).toHaveBeenCalledWith(session, 'hub-1', 'private.txt', jest.mocked(encryptWebE2eeV2Media).mock.calls[0][1].clientMessageId);
});

test('rejects oversized files before encryption or upload', async () => {
  const file = new File(['x'], 'large.txt');
  Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });
  await expect(uploadHubAttachment({ file, session: {} as E2eeV2Session, hubId: 'hub', userId: 'user', coords: {} })).rejects.toThrow('25 MiB');
  expect(encryptWebE2eeV2Media).not.toHaveBeenCalled();
});

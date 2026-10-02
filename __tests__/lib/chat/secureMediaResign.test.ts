import { chatAttachmentPathFromSignedUrl } from '@/lib/chat/mediaMetadata';
import { createSecureMediaObjectUrl } from '@/lib/chat/useSecureMedia';
import type { DerivedKeys } from '@/lib/chat/crypto';

jest.mock('@/lib/chat/crypto', () => ({
  decryptMediaBytes: jest.fn(async (payload: Uint8Array) => payload),
  decryptGroupMediaBytes: jest.fn(async (payload: Uint8Array) => payload),
}));

const SIGNED =
  'https://example.supabase.co/storage/v1/object/sign/chat-attachments/chat-1/user-1/1790-media.jpg?token=abc';

describe('chatAttachmentPathFromSignedUrl', () => {
  it('extracts the object path from a signed chat-attachments URL', () => {
    expect(chatAttachmentPathFromSignedUrl(SIGNED)).toBe('chat-1/user-1/1790-media.jpg');
  });

  it('ignores public, other-bucket, empty, and malformed URLs', () => {
    expect(
      chatAttachmentPathFromSignedUrl(
        'https://example.supabase.co/storage/v1/object/public/chat-media/u/c/1.jpg',
      ),
    ).toBeNull();
    expect(
      chatAttachmentPathFromSignedUrl(
        'https://example.supabase.co/storage/v1/object/sign/hub-media/a/b.jpg?token=x',
      ),
    ).toBeNull();
    expect(
      chatAttachmentPathFromSignedUrl(
        'https://example.supabase.co/storage/v1/object/sign/chat-attachments/?token=x',
      ),
    ).toBeNull();
    expect(chatAttachmentPathFromSignedUrl('not a url')).toBeNull();
    expect(chatAttachmentPathFromSignedUrl(null)).toBeNull();
  });
});

describe('createSecureMediaObjectUrl re-signing', () => {
  const originalFetch = global.fetch;
  const originalCreate = URL.createObjectURL;
  const keys = { encKey: new ArrayBuffer(32), macKey: new ArrayBuffer(32) } as unknown as DerivedKeys;
  const bytes = new Uint8Array([1, 2, 3]);

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:ok');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
  });

  function response(status: number, body: BodyInit | null, json?: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer : new ArrayBuffer(0)),
      json: async () => json,
      text: async () => '',
    } as unknown as Response;
  }

  it('re-signs from the storage path when the stored signed URL has expired', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === SIGNED) return response(400, null);
      if (url === '/api/chat/attachments/sign') return response(200, null, { url: 'https://fresh/signed' });
      if (url === 'https://fresh/signed') return response(200, bytes);
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const result = await createSecureMediaObjectUrl({
      storageUrl: SIGNED,
      storagePath: 'chat-1/user-1/1790-media.jpg',
      chatKey: keys,
      getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
      mimeType: 'image/jpeg',
    });

    expect(result).toBe('blob:ok');
    expect(calls).toEqual([SIGNED, '/api/chat/attachments/sign', 'https://fresh/signed']);
  });

  it('uses a working stored URL without signing', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return response(200, bytes);
    }) as typeof fetch;

    await createSecureMediaObjectUrl({
      storageUrl: SIGNED,
      storagePath: 'chat-1/user-1/1790-media.jpg',
      chatKey: keys,
      getAuthHeaders: async () => ({}),
    });

    expect(calls).toEqual([SIGNED]);
  });

  it('surfaces the fetch error when it cannot re-sign', async () => {
    global.fetch = jest.fn(async () => response(400, null)) as typeof fetch;
    await expect(
      createSecureMediaObjectUrl({ storageUrl: SIGNED, chatKey: keys }),
    ).rejects.toThrow('Failed to fetch media payload: 400');
  });
});

/** @jest-environment node */

import {
  decryptInboxPreviewContent,
  inboxPreviewText,
  UNREADABLE_PREVIEW_LABEL,
} from '@/lib/chat/inboxPreviews';
import { deriveKeysForConnection, encryptContent, isEncryptedWireContent } from '@/lib/chat/crypto';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { resolveWebE2eeV2Session, decryptWebE2eeV2Message } from '@/lib/chat/e2eeV2Client';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({
  resolveWebE2eeV2Session: jest.fn(),
  decryptWebE2eeV2Message: jest.fn(),
}));

const resolveSession = resolveWebE2eeV2Session as jest.Mock;
const decryptV2 = decryptWebE2eeV2Message as jest.Mock;
const supabase = {} as Parameters<typeof decryptInboxPreviewContent>[0];
const V2_WIRE = 'e2e2:eyJ0eXBlIjoibWVzc2FnZSJ9';

function direct(chatId: string | null = 'chat-1') {
  return {
    kind: 'direct' as const,
    chatId,
    connectionId: 'conn-1',
    participantUserIds: ['user-a', 'user-b'],
  };
}

describe('inbox previews never show ciphertext', () => {
  beforeEach(() => {
    resolveSession.mockReset();
    decryptV2.mockReset();
  });

  it('decrypts v1 pairwise text on this device', async () => {
    const keys = await deriveKeysForConnection('conn-1', ['user-a', 'user-b']);
    const wire = await encryptContent('see you at the climb', keys);
    await expect(decryptInboxPreviewContent(supabase, wire, 'text', direct())).resolves.toBe('see you at the climb');
  });

  it('decrypts v2 text through the chat epoch session', async () => {
    resolveSession.mockResolvedValue({ epochKeys: new Map() });
    decryptV2.mockResolvedValue('v2 hello');
    await expect(decryptInboxPreviewContent(supabase, V2_WIRE, 'text', direct('chat-v2-ok'))).resolves.toBe('v2 hello');
    expect(resolveSession).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'chat-v2-ok' }));
  });

  it('returns null (not the envelope) when this device has no v2 key', async () => {
    resolveSession.mockResolvedValue(null);
    await expect(decryptInboxPreviewContent(supabase, V2_WIRE, 'text', direct('chat-v2-missing'))).resolves.toBeNull();
  });

  it('returns null when v2 session resolution fails (fresh session, unapproved device)', async () => {
    resolveSession.mockRejectedValue(new Error('device not approved'));
    await expect(decryptInboxPreviewContent(supabase, V2_WIRE, 'text', direct('chat-v2-error'))).resolves.toBeNull();
  });

  it('returns null for v1 ciphertext without both participants', async () => {
    const keys = await deriveKeysForConnection('conn-x', ['user-a', 'user-b']);
    const wire = await encryptContent('secret', keys);
    const scope = { ...direct(), participantUserIds: ['user-a'] };
    await expect(decryptInboxPreviewContent(supabase, wire, 'text', scope)).resolves.toBeNull();
  });

  it('passes plaintext and system rows through untouched', async () => {
    await expect(decryptInboxPreviewContent(supabase, 'plain hello', 'text', direct())).resolves.toBe('plain hello');
    await expect(decryptInboxPreviewContent(supabase, '', 'beacon', direct())).resolves.toBe('');
  });

  it('labels undecryptable text as "Message" and media by type', () => {
    expect(inboxPreviewText({ messageType: 'text', plaintext: null })).toBe(UNREADABLE_PREVIEW_LABEL);
    expect(inboxPreviewText({ messageType: 'image', plaintext: null })).toBe('Photo');
    expect(inboxPreviewText({ messageType: 'audio', plaintext: null })).toBe('Voice message');
    expect(inboxPreviewText({ messageType: 'call_log', plaintext: '' })).toBe('Call');
    expect(inboxPreviewText({ messageType: 'text', plaintext: 'hi\nthere' })).toBe('hi there');
    expect(inboxPreviewText({ messageType: 'text', plaintext: 'on it', senderPrefix: 'You: ' })).toBe('You: on it');
  });

  it('never renders wire ciphertext even if a caller skips decryption', () => {
    for (const content of [V2_WIRE, 'e2e:AAAA', 'e2e_grp:AAAA']) {
      expect(isEncryptedWireContent(content)).toBe(true);
      const label = previewLabelForMessage({ message_type: 'text', content });
      expect(label).not.toContain('e2e');
      expect(inboxPreviewText({ messageType: 'text', plaintext: content })).toBe(UNREADABLE_PREVIEW_LABEL);
      expect(previewLabelForMessage({ message_type: 'image', content })).toBe('Photo');
    }
  });
});

/** @jest-environment node */

jest.mock('server-only', () => ({}));

import { generateDeviceIdentity, unwrapEpochKey } from '@/lib/chat/e2eeV2';
import {
  APPROVAL_EPOCH,
  APPROVAL_SENDER_DEVICE_ID,
  approvalChatId,
  consumeApprovalProof,
  createApprovalChallenge,
  emailApprovalLink,
  sendDeferredApprovalEmails,
} from '@/lib/server/deviceApproval';
import { FakeDb } from '../../helpers/fakeSupabase';

const REQUEST = '11111111-1111-4111-8111-111111111111';

async function world() {
  const phone = await generateDeviceIdentity();
  const db = new FakeDb({
    tables: {
      chat_devices: [
        { id: 'row-phone', user_id: 'me', device_id: 'phone-dev', identity_public_key: phone.publicKeySpkiBase64, key_algorithm: 'X25519', crypto_version: 2, created_at: '2026-09-01T00:00:00Z', revoked_at: null },
        { id: 'row-new', user_id: 'me', device_id: 'new-dev', identity_public_key: phone.publicKeySpkiBase64, key_algorithm: 'X25519', crypto_version: 2, created_at: '2026-10-01T00:00:00Z', revoked_at: null },
        { id: 'row-other', user_id: 'someone', device_id: 'other-dev', identity_public_key: phone.publicKeySpkiBase64, key_algorithm: 'X25519', crypto_version: 2, created_at: '2026-09-01T00:00:00Z', revoked_at: null },
      ],
      chat_device_approval_challenges: [],
      chat_device_history_requests: [],
    },
    defaults: {
      chat_device_approval_challenges: (row) => ({ used_at: null, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), ...row }),
    },
  });
  return { db, phone };
}

/** What the phone does: unwrap the challenge with its own private key and send it back. */
async function prove(envelope: string, privateKey: CryptoKey): Promise<string> {
  const nonce = await unwrapEpochKey({
    envelope,
    chatId: approvalChatId(REQUEST),
    epoch: APPROVAL_EPOCH,
    senderDeviceId: APPROVAL_SENDER_DEVICE_ID,
    recipientDeviceId: 'phone-dev',
    recipientPrivateKey: privateKey,
  });
  return Buffer.from(nonce).toString('base64');
}

describe('device approval challenges', () => {
  it('lets a device that holds its key approve, exactly once', async () => {
    const { db, phone } = await world();
    const challenge = await createApprovalChallenge(db.client as never, { userId: 'me', requestId: REQUEST, recipientDeviceRowId: 'row-new', approvingDeviceId: 'phone-dev' });
    expect(challenge).not.toBeNull();
    // Only a hash of the challenge is stored.
    expect(db.rows('chat_device_approval_challenges')[0].nonce_hash).toMatch(/^[0-9a-f]{64}$/);
    const proof = await prove(challenge!.envelope, phone.privateKey);
    const args = { userId: 'me', requestId: REQUEST, approvingDeviceId: 'phone-dev', challengeId: challenge!.challengeId, proof };
    await expect(consumeApprovalProof(db.client as never, args)).resolves.toBe('row-phone');
    await expect(consumeApprovalProof(db.client as never, args)).resolves.toBeNull();
  });

  it('refuses a wrong or late proof, another account, and the device approving itself', async () => {
    const { db, phone } = await world();
    const challenge = (await createApprovalChallenge(db.client as never, { userId: 'me', requestId: REQUEST, recipientDeviceRowId: 'row-new', approvingDeviceId: 'phone-dev' }))!;
    const proof = await prove(challenge.envelope, phone.privateKey);
    const base = { userId: 'me', requestId: REQUEST, approvingDeviceId: 'phone-dev', challengeId: challenge.challengeId };
    await expect(consumeApprovalProof(db.client as never, { ...base, proof: Buffer.alloc(32, 7).toString('base64') })).resolves.toBeNull();
    await expect(consumeApprovalProof(db.client as never, { ...base, userId: 'someone', proof })).resolves.toBeNull();
    await expect(consumeApprovalProof(db.client as never, { ...base, proof }, Date.now() + 6 * 60_000)).resolves.toBeNull();
    await expect(createApprovalChallenge(db.client as never, { userId: 'me', requestId: REQUEST, recipientDeviceRowId: 'row-phone', approvingDeviceId: 'phone-dev' })).resolves.toBeNull();
    await expect(createApprovalChallenge(db.client as never, { userId: 'me', requestId: REQUEST, recipientDeviceRowId: 'row-new', approvingDeviceId: 'other-dev' })).resolves.toBeNull();
  });
});

describe('approval email fallback', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const request = (id: string, extra: Record<string, unknown>) => ({
    id, user_id: 'me', status: 'pending', email_deferred: true, email_sent_at: null, created_at: minutesAgo(5), expires_at: minutesAgo(-600), ...extra,
  });

  it('emails only deferred requests no device decided within the delay, once', async () => {
    const db = new FakeDb({
      tables: {
        chat_device_history_requests: [
          request('due', {}),
          request('recent', { created_at: minutesAgo(1) }),
          request('legacy', { email_deferred: false }),
          request('approved', { status: 'approved' }),
          request('expired', { expires_at: minutesAgo(1) }),
        ],
      },
    });
    const client = { ...db.client, auth: { admin: { getUserById: async () => ({ data: { user: { email: 'me@example.com' } } }) } } };
    const send = jest.fn(async () => ({ error: null }));
    await expect(sendDeferredApprovalEmails(client as never, Date.now(), send)).resolves.toBe(1);
    expect(send).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/\/devices\/approve\/due$/));
    await expect(sendDeferredApprovalEmails(client as never, Date.now(), send)).resolves.toBe(0);
    // "Email me a link" after the sweep sent it: nothing new.
    await expect(emailApprovalLink(client as never, 'due', 'me', new Date().toISOString(), send)).resolves.toBe(false);
  });

  it('sends one email per account per cooldown, for its newest waiting device', async () => {
    const db = new FakeDb({
      tables: {
        chat_device_history_requests: [
          request('older', { created_at: minutesAgo(30) }),
          request('newest', { created_at: minutesAgo(4) }),
          request('middle', { created_at: minutesAgo(10) }),
          request('theirs', { user_id: 'someone', created_at: minutesAgo(6) }),
        ],
      },
    });
    const client = { ...db.client, auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }) } } };
    const send = jest.fn(async () => ({ error: null }));
    await expect(sendDeferredApprovalEmails(client as never, Date.now(), send)).resolves.toBe(2);
    expect(send).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/\/newest$/));
    expect(send).toHaveBeenCalledWith('someone@example.com', expect.stringMatching(/\/theirs$/));
    // The others leave the sweep but keep "Email me a link"…
    const byId = Object.fromEntries(db.rows('chat_device_history_requests').map((row) => [row.id, row]));
    expect(byId.older.email_deferred).toBe(false);
    expect(byId.middle.email_deferred).toBe(false);
    await expect(emailApprovalLink(client as never, 'older', 'me', new Date().toISOString(), send)).resolves.toBe(true);

    // …and a new device within the cooldown gets no automatic email.
    db.rows('chat_device_history_requests').push(request('later', { created_at: minutesAgo(4) }));
    send.mockClear();
    await expect(sendDeferredApprovalEmails(client as never, Date.now(), send)).resolves.toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(db.rows('chat_device_history_requests').find((row) => row.id === 'later')).toMatchObject({ email_deferred: false });

    // A device that signs in after the cooldown gets one again.
    const later = Date.now() + 13 * 3_600_000;
    db.rows('chat_device_history_requests').push(request('next-day', {
      created_at: new Date(later - 5 * 60_000).toISOString(), expires_at: new Date(later + 3_600_000).toISOString(),
    }));
    await expect(sendDeferredApprovalEmails(client as never, later, send)).resolves.toBe(1);
    expect(send).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/\/next-day$/));
  });

  it('retries every waiting device of an account whose email failed', async () => {
    const db = new FakeDb({
      tables: { chat_device_history_requests: [request('a', { created_at: minutesAgo(4) }), request('b', { created_at: minutesAgo(9) })] },
    });
    const client = { ...db.client, auth: { admin: { getUserById: async () => ({ data: { user: { email: 'me@example.com' } } }) } } };
    const send = jest.fn(async () => ({ error: { message: 'smtp down' } }));
    await expect(sendDeferredApprovalEmails(client as never, Date.now(), send)).resolves.toBe(0);
    expect(db.rows('chat_device_history_requests').every((row) => row.email_deferred === true && row.email_sent_at === null)).toBe(true);
  });
});

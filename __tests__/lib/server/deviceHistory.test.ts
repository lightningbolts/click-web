/** @jest-environment node */

jest.mock('server-only', () => ({}));

import {
  deviceApprovalPath,
  groupBackfillRows,
  requestHistoryApprovalForNewDevice,
  sessionProvesEmailAccess,
} from '@/lib/server/deviceHistory';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

const NOW = 1_800_000_000;

describe('sessionProvesEmailAccess', () => {
  it('accepts a session created from an emailed one-time link within 15 minutes', () => {
    expect(sessionProvesEmailAccess(jwt({ amr: [{ method: 'otp', timestamp: NOW - 60 }] }), NOW)).toBe(true);
    expect(sessionProvesEmailAccess(jwt({ amr: [{ method: 'magiclink', timestamp: NOW - 600 }] }), NOW)).toBe(true);
  });

  it('rejects password sessions, stale links and malformed tokens', () => {
    expect(sessionProvesEmailAccess(jwt({ amr: [{ method: 'password', timestamp: NOW - 5 }] }), NOW)).toBe(false);
    expect(sessionProvesEmailAccess(jwt({ amr: [{ method: 'otp', timestamp: NOW - 16 * 60 }] }), NOW)).toBe(false);
    expect(sessionProvesEmailAccess(jwt({}), NOW)).toBe(false);
    expect(sessionProvesEmailAccess('not-a-jwt', NOW)).toBe(false);
  });
});

describe('groupBackfillRows', () => {
  it('groups epochs per recipient device and chat, sorted', () => {
    const rows = [
      { request_id: 'r', recipient_device_id: 'new', recipient_public_key: 'pk', chat_id: 'c1', epoch: 2 },
      { request_id: 'r', recipient_device_id: 'new', recipient_public_key: 'pk', chat_id: 'c1', epoch: 1 },
      { request_id: 'r', recipient_device_id: 'new', recipient_public_key: 'pk', chat_id: 'c2', epoch: 1 },
    ];
    expect(groupBackfillRows(rows)).toEqual([
      { request_id: 'r', recipient_device_id: 'new', recipient_public_key: 'pk', chat_id: 'c1', epochs: [1, 2] },
      { request_id: 'r', recipient_device_id: 'new', recipient_public_key: 'pk', chat_id: 'c2', epochs: [1] },
    ]);
  });
});

function adminMock(options: { others: unknown[]; insertError?: { code?: string; message: string } }) {
  const insert = jest.fn(() => ({
    select: () => ({
      single: async () =>
        options.insertError ? { data: null, error: options.insertError } : { data: { id: 'req-1' }, error: null },
    }),
  }));
  const from = jest.fn((table: string) => {
    if (table === 'chat_devices') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        neq: () => chain,
        lt: () => chain,
        limit: async () => ({ data: options.others, error: null }),
      };
      return chain;
    }
    return { insert };
  });
  return { admin: { from } as never, insert };
}

describe('requestHistoryApprovalForNewDevice', () => {
  const NEW_DEVICE = { id: 'row-new', created_at: '2026-09-27T00:00:00Z' };
  const user = { id: 'user-1', email: 'me@example.com' };

  it('does nothing for the oldest device on an account', async () => {
    const { admin, insert } = adminMock({ others: [] });
    const send = jest.fn();
    await expect(requestHistoryApprovalForNewDevice(admin, user, NEW_DEVICE, send)).resolves.toBe('first-device');
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('records a pending request and emails a magic link to the approval page', async () => {
    const { admin, insert } = adminMock({ others: [{ id: 'row-old' }] });
    const send = jest.fn(async () => ({ error: null }));
    await expect(requestHistoryApprovalForNewDevice(admin, user, NEW_DEVICE, send)).resolves.toBe('requested');
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', recipient_device_id: 'row-new' });
    expect(send).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/\/devices\/approve\/req-1$/));
    expect(deviceApprovalPath('req-1')).toBe('/devices/approve/req-1');
  });

  it('does not email twice for the same device', async () => {
    const { admin } = adminMock({ others: [{ id: 'row-old' }], insertError: { code: '23505', message: 'dup' } });
    const send = jest.fn();
    await expect(requestHistoryApprovalForNewDevice(admin, user, NEW_DEVICE, send)).resolves.toBe('exists');
    expect(send).not.toHaveBeenCalled();
  });
});

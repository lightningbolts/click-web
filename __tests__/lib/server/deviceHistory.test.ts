/** @jest-environment node */

jest.mock('server-only', () => ({}));

import {
  APPROVAL_PUSH_COOLDOWN_MS,
  deviceApprovalPath,
  groupBackfillRows,
  requestHistoryApprovalForNewDevice,
  sessionProvesEmailAccess,
} from '@/lib/server/deviceHistory';
import { FakeDb } from '../../helpers/fakeSupabase';

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

function world(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  return new FakeDb({
    tables: {
      chat_devices: [
        { id: 'row-old', user_id: 'user-1', created_at: '2026-09-01T00:00:00Z', revoked_at: null },
        { id: 'row-new', user_id: 'user-1', created_at: '2026-09-27T00:00:00Z', revoked_at: null },
      ],
      chat_device_history_requests: [],
      ...extra,
    },
    unique: { chat_device_history_requests: [{ columns: ['recipient_device_id'] }] },
  });
}

describe('requestHistoryApprovalForNewDevice', () => {
  const NEW_DEVICE = { id: 'row-new', created_at: '2026-09-27T00:00:00Z', device_label: 'iPhone' };
  const user = { id: 'user-1' };

  it('does nothing for the oldest device on an account', async () => {
    const db = world();
    const notify = jest.fn();
    await expect(requestHistoryApprovalForNewDevice(db.client as never, user, { id: 'row-old', created_at: '2026-09-01T00:00:00Z' }, notify)).resolves.toBe('first-device');
    expect(db.rows('chat_device_history_requests')).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('records a pending request with the email deferred, and notifies the account', async () => {
    const db = world();
    const notify = jest.fn(async () => true);
    await expect(requestHistoryApprovalForNewDevice(db.client as never, user, NEW_DEVICE, notify)).resolves.toBe('requested');
    const [row] = db.rows('chat_device_history_requests');
    expect(row).toMatchObject({ user_id: 'user-1', recipient_device_id: 'row-new', email_deferred: true });
    expect(notify).toHaveBeenCalledWith(row.id, 'iPhone');
    expect(deviceApprovalPath('req-1')).toBe('/devices/approve/req-1');
  });

  it('never asks twice while a request stands', async () => {
    const db = world({ chat_device_history_requests: [{ id: 'req-1', recipient_device_id: 'row-new', status: 'pending', expires_at: '2999-01-01T00:00:00Z' }] });
    const notify = jest.fn();
    await expect(requestHistoryApprovalForNewDevice(db.client as never, user, NEW_DEVICE, notify)).resolves.toBe('exists');
    expect(notify).not.toHaveBeenCalled();
  });

  it('asks again once expired, and after a denial only when the device asks again', async () => {
    const expired = world({ chat_device_history_requests: [{ id: 'req-1', recipient_device_id: 'row-new', status: 'pending', expires_at: '2020-01-01T00:00:00Z' }] });
    const notify = jest.fn(async () => true);
    await expect(requestHistoryApprovalForNewDevice(expired.client as never, user, NEW_DEVICE, notify)).resolves.toBe('requested');
    expect(expired.rows('chat_device_history_requests')[0]).toMatchObject({ status: 'pending', email_sent_at: null, email_deferred: true });
    expect(Date.parse(expired.rows('chat_device_history_requests')[0].expires_at as string)).toBeGreaterThan(Date.now());

    const denied = world({ chat_device_history_requests: [{ id: 'req-1', recipient_device_id: 'row-new', status: 'denied', expires_at: '2999-01-01T00:00:00Z' }] });
    await expect(requestHistoryApprovalForNewDevice(denied.client as never, user, NEW_DEVICE, notify)).resolves.toBe('exists');
    await expect(requestHistoryApprovalForNewDevice(denied.client as never, user, NEW_DEVICE, notify, { reopen: true })).resolves.toBe('requested');
    expect(denied.rows('chat_device_history_requests')[0].status).toBe('pending');
  });

  it('pushes once while another sign-in is still waiting from the last few minutes', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const stale = new Date(Date.now() - APPROVAL_PUSH_COOLDOWN_MS - 60_000).toISOString();
    const waiting = (status: string, created_at: string) =>
      world({ chat_device_history_requests: [{ id: 'req-other', user_id: 'user-1', recipient_device_id: 'row-other', status, created_at, expires_at: '2999-01-01T00:00:00Z' }] });

    const burst = waiting('pending', recent);
    const quiet = jest.fn(async () => true);
    await expect(requestHistoryApprovalForNewDevice(burst.client as never, user, NEW_DEVICE, quiet)).resolves.toBe('requested');
    expect(burst.rows('chat_device_history_requests')).toHaveLength(2);
    expect(quiet).not.toHaveBeenCalled();

    for (const [status, created_at] of [['approved', recent], ['pending', stale]]) {
      const notify = jest.fn(async () => true);
      await requestHistoryApprovalForNewDevice(waiting(status, created_at).client as never, user, NEW_DEVICE, notify);
      expect(notify).toHaveBeenCalledTimes(1);
    }
  });
});

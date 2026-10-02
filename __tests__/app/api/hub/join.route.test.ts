/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/hub/join/route';

const mockGate = jest.fn();
const mockAdmin = jest.fn();
jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: jest.fn(async () => ({ ok: true, user: { id: 'user-1' } })),
  createChatGatekeeperAdmin: () => mockAdmin(),
}));
jest.mock('@/lib/server/hubGatekeeper', () => ({ assertHubAccess: (...args: unknown[]) => mockGate(...args) }));

test('passes fresh coordinates to the authoritative gate before creating membership', async () => {
  const admin = { from: jest.fn() };
  mockAdmin.mockReturnValue(admin);
  mockGate.mockResolvedValue(NextResponse.json({ error: 'OUT_OF_BOUNDS' }, { status: 400 }));
  const response = await POST(new NextRequest('https://click.test/api/hub/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hub_id: 'hub-1', user_lat: 47, user_long: -122 }),
  }));
  expect(mockGate).toHaveBeenLastCalledWith(admin, 'hub-1', 'user-1', 47, -122);
  expect(response.status).toBe(400);
  expect(admin.from).not.toHaveBeenCalled();
});

test('preserves event joins without location and does not coerce untrusted coordinates', async () => {
  const admin = { from: jest.fn() };
  mockAdmin.mockReturnValue(admin);
  mockGate.mockResolvedValue(NextResponse.json({ error: 'EVENT_HUB_ACCESS_DENIED' }, { status: 403 }));
  await POST(new NextRequest('https://click.test/api/hub/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hub_id: 'event-hub', user_lat: '47' }),
  }));
  expect(mockGate).toHaveBeenLastCalledWith(admin, 'event-hub', 'user-1', undefined, undefined);
  expect(admin.from).not.toHaveBeenCalled();
});

/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { GET, PATCH } from '@/app/api/hub/[id]/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertHubReadable = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

const context = { params: Promise.resolve({ id: 'hub-event' }) };

describe('/api/hub/[id] event ownership and read access', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertHubReadable.mockReset();
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: 'host-1' }, bearer: 'jwt' });
  });

  it('does not return event-hub metadata after the authoritative gate denies access', async () => {
    const denied = NextResponse.json({ error: 'HUB_EXPIRED' }, { status: 410 });
    mockAssertHubReadable.mockResolvedValue(denied);
    const from = jest.fn();
    mockCreateAdmin.mockReturnValue({ from });

    const response = await GET(new NextRequest('https://click.example/api/hub/hub-event'), context);

    expect(response.status).toBe(410);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects direct PATCH of an event-owned hub before attempting an update', async () => {
    const update = jest.fn();
    mockCreateAdmin.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'hub-event', creator_id: 'host-1', event_beacon_id: 'event-1' },
              error: null,
            }),
          })),
        })),
        update,
      })),
    });

    const response = await PATCH(
      new NextRequest('https://click.example/api/hub/hub-event', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Not allowed' }),
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'EVENT_OWNED_HUB',
      message: 'Edit this event from its event details instead of changing the hub directly.',
    });
    expect(update).not.toHaveBeenCalled();
  });
});

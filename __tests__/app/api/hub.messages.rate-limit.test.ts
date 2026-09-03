/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/hub/messages/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockParseBody = jest.fn();
const mockIsRateLimited = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

jest.mock('@/lib/api/parseBody', () => ({
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  HUB_MESSAGE_RATE_LIMIT: 30,
  HUB_MESSAGE_RATE_LIMIT_BINDING: 'HUB_MESSAGE_RATE_LIMITER',
  HUB_MUTATION_RATE_WINDOW_MS: 60_000,
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubGeofenceFromCoords: jest.fn(),
  assertHubReadable: jest.fn(),
}));

jest.mock('@/lib/hub/notifyHubMessage', () => ({
  notifyHubMessageParticipants: jest.fn(),
}));

describe('/api/hub/messages mutation rate limit', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockParseBody.mockReset();
    mockIsRateLimited.mockReset();
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: 'user-1' }, bearer: 'jwt' });
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hub_id: 'hub-1', body: 'encrypted message' },
    });
  });

  it('rejects messages after the per-user and per-hub budget is exhausted', async () => {
    mockIsRateLimited.mockResolvedValue(true);

    const response = await POST(
      new NextRequest('https://click.example/api/hub/messages', { method: 'POST' }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: 'RATE_LIMITED',
      message: 'Too many messages. Please wait a moment and try again.',
    });
    expect(mockIsRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'hub-message:user-1:hub-1', limit: 30 }),
    );
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });
});

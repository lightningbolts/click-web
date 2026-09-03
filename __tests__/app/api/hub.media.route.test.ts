/** @jest-environment node */

import { NextRequest } from 'next/server';
import {
  GET,
  MAX_MULTIPART_REQUEST_BYTES,
  POST,
  HUB_MEDIA_MAX_BYTES,
} from '@/app/api/hub/media/route';

const mockRequireBearerUser = jest.fn();
const mockIsRateLimited = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: jest.fn(),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubGeofenceFromCoords: jest.fn(),
  assertHubReadable: jest.fn(),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  HUB_MUTATION_RATE_WINDOW_MS: 60_000,
  HUB_UPLOAD_RATE_LIMIT: 6,
  HUB_UPLOAD_RATE_LIMIT_BINDING: 'HUB_UPLOAD_RATE_LIMITER',
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

describe('/api/hub/media', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockIsRateLimited.mockReset();
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: 'user-1' }, bearer: 'jwt' });
    mockIsRateLimited.mockResolvedValue(false);
  });

  it('rejects an oversized multipart request before parsing it into memory', async () => {
    const response = await POST(
      new NextRequest('https://click.example/api/hub/media', {
        method: 'POST',
        headers: { 'content-length': String(HUB_MEDIA_MAX_BYTES + 1024 * 1024 + 1) },
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Hub media must be 25 MiB or smaller' });
  });

  it('bounds an unknown-length request stream before calling formData', async () => {
    const formData = jest.fn(() => {
      throw new Error('formData must not be called for an oversized stream');
    });
    const request = {
      url: 'https://click.example/api/hub/media',
      method: 'POST',
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=fixture' }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_MULTIPART_REQUEST_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
      formData,
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it('rejects traversal paths before authorizing or signing media', async () => {
    const response = await GET(
      new NextRequest('https://click.example/api/hub/media?hubId=hub-1&path=../other/file'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid media path' });
  });

  it('enforces the per-user and per-hub upload budget', async () => {
    mockIsRateLimited.mockResolvedValue(true);
    const form = new FormData();
    form.set('hub_id', 'hub-1');
    form.set('object_path', 'user-1/hub/hub-1/media.enc');
    form.set('file', new Blob(['ciphertext'], { type: 'application/octet-stream' }));

    const response = await POST(
      new NextRequest('https://click.example/api/hub/media', { method: 'POST', body: form }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: 'RATE_LIMITED',
      message: 'Too many uploads. Please wait a moment and try again.',
    });
    expect(mockIsRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'hub-upload:user-1:hub-1', limit: 6 }),
    );
  });
});

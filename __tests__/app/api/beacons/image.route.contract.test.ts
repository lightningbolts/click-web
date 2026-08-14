/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { beaconPhotoObjectPath, isBeaconPhotoPathOwnedByUser } from '@/lib/map/beaconPhotoPath';

const mockGetSupabaseFromRouteRequest = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

function postImage(body: Record<string, unknown>, auth = true): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.authorization = 'Bearer fake.jwt.token';
  return new NextRequest('http://localhost/api/beacons/image', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('beaconPhotoObjectPath', () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('puts auth uid in the first path segment so avatars RLS allows INSERT', () => {
    const path = beaconPhotoObjectPath(userId, 'jpg', 1_700_000_000_000);
    expect(path).toBe(`${userId}/beacons/1700000000000.jpg`);
    expect(path.split('/')[0]).toBe(userId);
    expect(isBeaconPhotoPathOwnedByUser(path, userId)).toBe(true);
  });

  it('still recognizes the legacy beacons/{uid}/... layout', () => {
    expect(isBeaconPhotoPathOwnedByUser(`beacons/${userId}/1.jpg`, userId)).toBe(true);
    expect(isBeaconPhotoPathOwnedByUser(`beacons/other/1.jpg`, userId)).toBe(false);
    expect(isBeaconPhotoPathOwnedByUser(`${userId}/avatar.jpg`, userId)).toBe(true);
  });
});

describe('POST /api/beacons/image', () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tinyJpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { storage: { from: jest.fn() } },
      user: null,
      authError: new Error('no session'),
    });
    const { POST } = await import('@/app/api/beacons/image/route');
    const res = await POST(postImage({ file_b64: tinyJpegB64 }, false));
    expect(res.status).toBe(401);
  });

  it('uploads under {userId}/beacons/... and returns a public URL', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: `https://cdn.example/avatars/${userId}/beacons/1.jpg` },
    });
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      user: { id: userId },
      authError: null,
      supabase: {
        storage: {
          from: jest.fn().mockReturnValue({ upload, getPublicUrl }),
        },
      },
    });

    const { POST } = await import('@/app/api/beacons/image/route');
    const res = await POST(
      postImage({ file_b64: tinyJpegB64, mime_type: 'image/jpeg' }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { image?: string };
    expect(json.image).toContain(`/avatars/${userId}/beacons/`);
    expect(upload).toHaveBeenCalled();
    const objectPath = upload.mock.calls[0][0] as string;
    expect(objectPath.startsWith(`${userId}/beacons/`)).toBe(true);
    expect(objectPath.endsWith('.jpg')).toBe(true);
  });
});

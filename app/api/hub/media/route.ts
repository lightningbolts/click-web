/**
 * Private event-hub media gateway.
 *
 * POST multipart/form-data: hub_id, object_path, file (opaque ciphertext),
 * mime_type, user_lat, user_long. GET mints a short-lived URL for an existing
 * object after re-checking membership/check-in access.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertHubGeofenceFromCoords,
  assertHubReadable,
} from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import {
  HUB_MUTATION_RATE_WINDOW_MS,
  HUB_UPLOAD_RATE_LIMIT,
  HUB_UPLOAD_RATE_LIMIT_BINDING,
  isRateLimited,
} from '@/lib/server/rateLimit';

export const maxDuration = 60;
export const runtime = 'nodejs';

export const HUB_MEDIA_BUCKET = 'hub-media';
export const HUB_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const HUB_MEDIA_SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_MULTIPART_REQUEST_BYTES = HUB_MEDIA_MAX_BYTES + 1024 * 1024;

function readHubMediaPath(
  path: string,
  hubId: string,
  uploaderId?: string,
): { ok: true; path: string } | { ok: false; response: NextResponse } {
  const normalized = path.trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid media path' }, { status: 400 }) };
  }
  const segments = normalized.split('/');
  if (segments.length < 4 || segments.some((segment) => !segment.trim())) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid media path layout' }, { status: 400 }) };
  }
  if (uploaderId && segments[0] !== uploaderId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'media path must start with the authenticated user id' }, { status: 403 }),
    };
  }
  if (segments[1].toLowerCase() !== 'hub' || segments[2] !== hubId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'media path does not belong to this hub' }, { status: 403 }),
    };
  }
  return { ok: true, path: normalized };
}

function signedMediaResponse(path: string, url: string | null) {
  return NextResponse.json({
    path,
    bucket: HUB_MEDIA_BUCKET,
    url,
    ttl_seconds: HUB_MEDIA_SIGNED_URL_TTL_SECONDS,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const hubId = (request.nextUrl.searchParams.get('hub_id') ?? request.nextUrl.searchParams.get('hubId') ?? '').trim();
  const rawPath = (request.nextUrl.searchParams.get('path') ?? '').trim();
  if (!hubId || !rawPath) {
    return NextResponse.json({ error: 'hub_id and path are required' }, { status: 400 });
  }
  const pathResult = readHubMediaPath(rawPath, hubId);
  if (!pathResult.ok) return pathResult.response;

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubReadable(admin, hubId, auth.user.id);
  if (denied) return denied;

  const { data, error } = await admin.storage
    .from(HUB_MEDIA_BUCKET)
    .createSignedUrl(pathResult.path, HUB_MEDIA_SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('[hub/media] signed URL:', { message: error.message, hubId });
    return NextResponse.json({ error: 'Failed to access hub media' }, { status: 500 });
  }
  return signedMediaResponse(pathResult.path, data?.signedUrl ?? null);
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Hub media must be 25 MiB or smaller' }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const hubId = String(form.get('hub_id') ?? form.get('hubId') ?? '').trim();
  const objectPath = String(form.get('object_path') ?? form.get('objectPath') ?? '').trim();
  const file = form.get('file');
  const latRaw = form.get('user_lat') ?? form.get('userLat');
  const lonRaw = form.get('user_long') ?? form.get('userLong');
  const userLat = typeof latRaw === 'string' && latRaw.trim() !== '' ? Number.parseFloat(latRaw) : NaN;
  const userLong = typeof lonRaw === 'string' && lonRaw.trim() !== '' ? Number.parseFloat(lonRaw) : NaN;

  if (!hubId) {
    return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > HUB_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: 'Hub media must be 25 MiB or smaller' }, { status: 413 });
  }
  if (
    await isRateLimited({
      bindingName: HUB_UPLOAD_RATE_LIMIT_BINDING,
      key: `hub-upload:${auth.user.id}:${hubId}`,
      limit: HUB_UPLOAD_RATE_LIMIT,
      windowMs: HUB_MUTATION_RATE_WINDOW_MS,
    })
  ) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429 },
    );
  }
  const pathResult = readHubMediaPath(objectPath, hubId, auth.user.id);
  if (!pathResult.ok) return pathResult.response;

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubGeofenceFromCoords(admin, hubId, userLat, userLong, auth.user.id);
  if (denied) return denied;

  const { error: participantErr } = await admin
    .from('hub_participants')
    .upsert({ hub_id: hubId, user_id: auth.user.id }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
  if (participantErr) {
    console.error('[hub/media] participant upsert:', participantErr.message);
    return NextResponse.json({ error: 'Failed to verify hub membership' }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > HUB_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: 'Hub media must be 25 MiB or smaller' }, { status: 413 });
  }

  const declaredType = typeof form.get('mime_type') === 'string' ? String(form.get('mime_type')).trim() : '';
  const contentType = declaredType.length > 0 ? declaredType : 'application/octet-stream';
  const { error: uploadError } = await admin.storage.from(HUB_MEDIA_BUCKET).upload(pathResult.path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    console.error('[hub/media] upload:', { message: uploadError.message, hubId, bytes: buffer.length });
    return NextResponse.json({ error: 'Failed to upload hub media' }, { status: 400 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(HUB_MEDIA_BUCKET)
    .createSignedUrl(pathResult.path, HUB_MEDIA_SIGNED_URL_TTL_SECONDS);
  if (signedError) {
    // The upload succeeded; clients can retry GET to mint a URL without uploading again.
    console.error('[hub/media] initial signed URL:', { message: signedError.message, hubId });
  }
  return NextResponse.json(
    {
      path: pathResult.path,
      bucket: HUB_MEDIA_BUCKET,
      url: signed?.signedUrl ?? null,
      ttl_seconds: HUB_MEDIA_SIGNED_URL_TTL_SECONDS,
    },
    { status: 201 },
  );
}

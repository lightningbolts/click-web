/**
 * POST /api/hub/media
 * multipart/form-data: hub_id, object_path, file (opaque ciphertext), mime_type,
 *   user_lat, user_long (for geofence gate)
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertHubGeofenceFromCoords } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const CHAT_MEDIA_BUCKET = 'chat-media';

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const hubId = String(form.get('hub_id') ?? form.get('hubId') ?? '').trim();
  const objectPath = String(form.get('object_path') ?? form.get('objectPath') ?? '').trim();
  const file = form.get('file');
  const latRaw = form.get('user_lat') ?? form.get('userLat');
  const lonRaw = form.get('user_long') ?? form.get('userLong');
  const userLat = typeof latRaw === 'string' ? Number.parseFloat(latRaw) : Number(latRaw);
  const userLong = typeof lonRaw === 'string' ? Number.parseFloat(lonRaw) : Number(lonRaw);

  if (!hubId) {
    return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  }
  if (!objectPath) {
    return NextResponse.json({ error: 'object_path is required' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubGeofenceFromCoords(admin, hubId, userLat, userLong);
  if (denied) return denied;

  const firstSeg = objectPath.split('/')[0]?.trim();
  if (firstSeg !== auth.user.id) {
    return NextResponse.json({ error: 'object_path must start with the authenticated user id' }, { status: 403 });
  }
  const secondSeg = objectPath.split('/')[1]?.trim()?.toLowerCase();
  if (secondSeg !== 'hub') {
    return NextResponse.json({ error: 'object_path must use .../hub/{hub_id}/... segment' }, { status: 403 });
  }
  const thirdSeg = objectPath.split('/')[2]?.trim();
  if (!thirdSeg || thirdSeg.toLowerCase() !== hubId.toLowerCase()) {
    return NextResponse.json({ error: 'object_path must include hub_id after hub/' }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }

  const declaredType = typeof form.get('mime_type') === 'string' ? String(form.get('mime_type')).trim() : '';
  const contentType =
    declaredType.length > 0 ? declaredType : 'application/octet-stream';

  const { error: uploadError } = await admin.storage.from(CHAT_MEDIA_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });

  if (uploadError) {
    console.error('[hub/media] upload:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  return NextResponse.json({ path: objectPath }, { status: 201 });
}

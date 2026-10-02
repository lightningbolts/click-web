import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { avatarJsonBodySchema } from '@/lib/api/schemas/user';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';
import { placePhotoUrl } from '@/lib/server/places/serialize';

const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = 'place-photos';
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function stripDataUriPrefix(value: string): string {
  const trimmed = value.trim();
  const marker = 'base64,';
  const i = trimmed.indexOf(marker);
  return i > 0 && trimmed.slice(0, i).toLowerCase().startsWith('data:') ? trimmed.slice(i + marker.length).trim() : trimmed;
}

/**
 * POST /api/places/[placeId]/photo — cover photo (§5.7). Same JSON base64 body as
 * `/api/beacons/image`; 5 MB; jpeg/png/webp. Written with the service role (the bucket has no
 * client write policies); the previous cover is removed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner', 'manager'] });
    if (!ctx.ok) return ctx.response;
    const { admin, place } = ctx;

    const parsed = await parseBody(request, avatarJsonBodySchema);
    if (!parsed.ok) return parsed.response;
    const mime = (parsed.data.mime_type?.trim().toLowerCase().split(';')[0] ?? 'image/jpeg') || 'image/jpeg';
    const ext = EXTENSIONS[mime];
    if (!ext) return apiError('Use a JPEG, PNG or WebP image', 400, 'unsupported_type');
    const buffer = Buffer.from(stripDataUriPrefix(parsed.data.file_b64), 'base64');
    if (buffer.length === 0) return apiError('Empty image payload', 400, 'empty_image');
    if (buffer.length > MAX_BYTES) return apiError('Image must be under 5 MB', 400, 'too_large');

    const path = `${place.id}/cover-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
      upsert: false,
    });
    if (uploadError) {
      console.error('[places/photo] upload:', uploadError.message);
      return apiError('Upload failed', 500);
    }
    const { error: updateError } = await admin.from('places').update({ photo_path: path }).eq('id', place.id);
    if (updateError) {
      await admin.storage.from(BUCKET).remove([path]);
      console.error('[places/photo] update:', updateError.message);
      return apiError('Upload failed', 500);
    }
    if (place.photo_path && place.photo_path !== path) {
      const { error } = await admin.storage.from(BUCKET).remove([place.photo_path]);
      if (error) console.warn('[places/photo] remove previous:', error.message);
    }
    return NextResponse.json({ photo_url: placePhotoUrl(path) });
  } catch (e) {
    console.error('POST /api/places/[placeId]/photo:', e);
    return apiError('Internal Server Error', 500);
  }
}

/**
 * POST /api/user/avatar
 * Accepts either:
 * - multipart/form-data: `file` (image), optional `mime_type`
 * - application/json: `file_b64` (base64 image), optional `mime_type`
 * Verifies JWT, uploads to `avatars` storage, updates `public.users.image`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { avatarJsonBodySchema } from '@/lib/api/schemas/user';

const MAX_BYTES = 2_000_000;
const AVATARS_BUCKET = 'avatars';

type AvatarUploadJsonBody = {
  file_b64?: unknown;
  mime_type?: unknown;
};

function extensionFromMime(mime: string): string {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  return 'jpg';
}

function isAllowedImageMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(m);
}

function stripDataUriPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const marker = 'base64,';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex <= 0) return trimmed;
  if (!trimmed.slice(0, markerIndex).toLowerCase().startsWith('data:')) return trimmed;
  return trimmed.slice(markerIndex + marker.length).trim();
}

export async function POST(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);

  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestContentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const isMultipart = requestContentType.includes('multipart/form-data');
  let buffer: Buffer;
  let declaredMime = 'image/jpeg';

  if (!isMultipart) {
    const parsedJson = await parseBody(request, avatarJsonBodySchema);
    if (!parsedJson.ok) return parsedJson.response;
    const parsedBody = parsedJson.data;

    const fileB64Raw = parsedBody.file_b64;
    const fileB64 = stripDataUriPrefix(fileB64Raw);
    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });
    }

    buffer = Buffer.from(fileB64, 'base64');
    declaredMime =
      typeof parsedBody.mime_type === 'string' && parsedBody.mime_type.trim().length > 0
        ? parsedBody.mime_type.trim()
        : 'image/jpeg';
  } else {
    const form = await request.formData().catch((err) => {
      console.error('[user/avatar] formData() failed:', err);
      return null;
    });
    if (!form) {
      return NextResponse.json(
        {
          error:
            'Could not parse upload body. Send application/json with file_b64 or multipart/form-data with binary part "file".',
          received_content_type: requestContentType || null,
        },
        { status: 400 },
      );
    }

    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Multipart part "file" (image) is required' }, { status: 400 });
    }

    buffer = Buffer.from(await file.arrayBuffer());
    const fromFormMime =
      typeof form.get('mime_type') === 'string' ? String(form.get('mime_type')).trim() : '';
    declaredMime =
      fromFormMime.length > 0 ? fromFormMime : (file.type && file.type.trim()) || 'image/jpeg';
  }

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Empty image payload' }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });
  }

  if (!isAllowedImageMime(declaredMime)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  const contentType = declaredMime.split(';')[0]?.trim() || 'image/jpeg';
  const ext = extensionFromMime(declaredMime);
  const objectPath = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });

  if (uploadError) {
    console.error('[user/avatar] storage upload:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) {
    return NextResponse.json({ error: 'Could not resolve public URL' }, { status: 500 });
  }

  const { error: dbError } = await supabase.from('users').update({ image: publicUrl }).eq('id', user.id);

  if (dbError) {
    console.error('[user/avatar] users update:', dbError.message);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const { data: userRow, error: readErr } = await supabase
    .from('users')
    .select('id, first_name, last_name, name, full_name, birthday, image, email')
    .eq('id', user.id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  return NextResponse.json({ image: publicUrl, user: userRow }, { status: 200 });
}

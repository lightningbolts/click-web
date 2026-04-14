/**
 * POST /api/user/avatar
 * multipart/form-data: `file` (image), optional `mime_type`.
 * Verifies JWT, uploads to `avatars` storage, updates `public.users.image`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

const MAX_BYTES = 2_000_000;
const AVATARS_BUCKET = 'avatars';

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

export async function POST(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);

  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });
  }

  const fromFormMime =
    typeof form.get('mime_type') === 'string' ? String(form.get('mime_type')).trim() : '';
  const declaredMime =
    fromFormMime.length > 0 ? fromFormMime : (file.type && file.type.trim()) || 'image/jpeg';

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

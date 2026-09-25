import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { groupAvatarBodySchema } from '@/lib/api/schemas/user';

const MAX_BYTES = 2_000_000;
const AVATARS_BUCKET = 'avatars';
const PROFILE_CHANGE_COOLDOWN_MS = 60_000;

type RouteParams = { params: Promise<{ groupId: string }> };
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
  const marker = 'base64,';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex <= 0) return trimmed;
  if (!trimmed.slice(0, markerIndex).toLowerCase().startsWith('data:')) return trimmed;
  return trimmed.slice(markerIndex + marker.length).trim();
}

type RouteSupabase = Awaited<ReturnType<typeof getSupabaseFromRouteRequest>>;
type GroupProfileAuth =
  | { response: NextResponse }
  | {
      groupId: string;
      user: NonNullable<RouteSupabase['user']>;
      supabase: RouteSupabase['supabase'];
      admin: ReturnType<typeof createAdminClient>;
      group: { avatar_url?: string | null };
    };

/** Member of the group, group exists, and the 60 s profile-change cooldown has passed. */
async function authorizeGroupProfileChange(request: NextRequest, { params }: RouteParams): Promise<GroupProfileAuth> {
  const { groupId: rawGroupId } = await params;
  const groupId = rawGroupId?.trim() ?? '';
  if (!groupId) return { response: NextResponse.json({ error: 'groupId required' }, { status: 400 }) };

  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: member, error: memberErr } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr) return { response: NextResponse.json({ error: memberErr.message }, { status: 500 }) };
  if (!member) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  const { data: group, error: groupErr } = await admin
    .from('groups')
    .select('id, avatar_url, profile_updated_at')
    .eq('id', groupId)
    .maybeSingle();
  if (groupErr) return { response: NextResponse.json({ error: groupErr.message }, { status: 500 }) };
  if (!group) return { response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };

  const lastChangedRaw =
    typeof group.profile_updated_at === 'string' && group.profile_updated_at.trim()
      ? Date.parse(group.profile_updated_at)
      : Number.NaN;
  if (Number.isFinite(lastChangedRaw)) {
    const waitMs = PROFILE_CHANGE_COOLDOWN_MS - (Date.now() - lastChangedRaw);
    if (waitMs > 0) {
      return {
        response: NextResponse.json(
          {
            error: `Please wait ${Math.ceil(waitMs / 1000)}s before changing this group profile again.`,
          },
          { status: 429 },
        ),
      };
    }
  }
  return { groupId, user, supabase, admin, group };
}

/** `avatars/{uploader}/groups/{groupId}/{file}` from a public URL, only for this group. */
function groupAvatarObjectPath(avatarUrl: unknown, groupId: string): string | null {
  if (typeof avatarUrl !== 'string') return null;
  const marker = `/${AVATARS_BUCKET}/`;
  const index = avatarUrl.indexOf(marker);
  if (index < 0) return null;
  const path = decodeURIComponent(avatarUrl.slice(index + marker.length).split('?')[0] ?? '');
  const segments = path.split('/');
  if (segments.length !== 4 || segments[1] !== 'groups' || segments[2] !== groupId || path.includes('..')) return null;
  return path;
}

export async function POST(request: NextRequest, context: RouteParams) {
  const auth = await authorizeGroupProfileChange(request, context);
  if ('response' in auth) return auth.response;
  const { groupId, user, supabase, admin } = auth;

  const parsedJson = await parseBody(request, groupAvatarBodySchema);
  if (!parsedJson.ok) return parsedJson.response;
  const parsedBody = parsedJson.data;

  const fileB64 = stripDataUriPrefix(parsedBody.file_b64);
  if (!fileB64) return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });

  const declaredMime =
    typeof parsedBody.mime_type === 'string' && parsedBody.mime_type.trim().length > 0
      ? parsedBody.mime_type.trim()
      : 'image/jpeg';
  if (!isAllowedImageMime(declaredMime)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  const buffer = Buffer.from(fileB64, 'base64');
  if (buffer.length === 0) return NextResponse.json({ error: 'Empty image payload' }, { status: 400 });
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });

  const contentType = declaredMime.split(';')[0]?.trim() || 'image/jpeg';
  const ext = extensionFromMime(declaredMime);
  const objectPath = `${user.id}/groups/${groupId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return NextResponse.json({ error: 'Could not resolve public URL' }, { status: 500 });

  const { data: groupRow, error: updateErr } = await admin
    .from('groups')
    .update({
      avatar_url: publicUrl,
      profile_updated_at: new Date().toISOString(),
      profile_updated_by: user.id,
    })
    .eq('id', groupId)
    .select('id, name, avatar_url, profile_updated_at')
    .maybeSingle();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ image: publicUrl, group: groupRow }, { status: 200 });
}

/**
 * DELETE /api/groups/{groupId}/avatar — any member removes the group photo (same cooldown as
 * upload). Clears `groups.avatar_url` and best-effort deletes the stored object.
 */
export async function DELETE(request: NextRequest, context: RouteParams) {
  const auth = await authorizeGroupProfileChange(request, context);
  if ('response' in auth) return auth.response;
  const { groupId, user, admin, group } = auth;

  const { data: groupRow, error: updateErr } = await admin
    .from('groups')
    .update({
      avatar_url: null,
      profile_updated_at: new Date().toISOString(),
      profile_updated_by: user.id,
    })
    .eq('id', groupId)
    .select('id, name, avatar_url, profile_updated_at')
    .maybeSingle();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const objectPath = groupAvatarObjectPath(group.avatar_url, groupId);
  if (objectPath) {
    const { error: removeError } = await admin.storage.from(AVATARS_BUCKET).remove([objectPath]);
    if (removeError) console.warn('[groups/avatar] remove object:', removeError.message);
  }

  return NextResponse.json({ image: null, group: groupRow }, { status: 200 });
}

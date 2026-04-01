import { getSupabaseClient } from '@/lib/supabase';

/** Matches KMP `ChatMediaConstants.CHAT_MEDIA_BUCKET`. */
export const CHAT_MEDIA_BUCKET = 'chat-media';

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Math.random().toString(36).slice(2, 10)}`;
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  return 'bin';
}

/**
 * Uploads a blob to the chat-media bucket and returns its public URL.
 * Requires a public bucket or appropriate RLS; see `click/database/chat_media_storage.sql`.
 */
export async function uploadChatMediaBlob(
  userId: string,
  file: Blob,
  contentType: string,
): Promise<{ publicUrl: string; path: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const ext = extForMime(contentType || file.type || 'application/octet-stream');
  const path = `web/${userId}/${Date.now()}-${randomSuffix()}.${ext}`;

  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, {
    contentType: contentType || file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data: pub } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(data.path);
  return { publicUrl: pub.publicUrl, path: data.path };
}

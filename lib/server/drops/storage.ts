import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The private `click-drops` bucket has no client policies: only click-web (service role) reads or
 * writes it, and viewers get short-lived signed URLs after the access and reveal checks.
 *
 * Layout: `{kind}/{scopeId}/{userId}/{stamp}-{rand}-{role}.{ext}`
 *   chat:   scopeId = chat id   (E2EE ciphertext of the original)
 *   event:  scopeId = beacon id
 *   shared: scopeId = user id
 */
export const DROPS_BUCKET = 'click-drops';
export const DROP_SIGNED_URL_TTL_SECONDS = 10 * 60;

export const DROP_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function extForImageMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
}

export function dropObjectPrefix(kind: 'chat' | 'event' | 'shared', scopeId: string, userId: string): string {
  return `${kind}/${scopeId}/${userId}/`;
}

export function newDropObjectPath(
  prefix: string,
  role: 'original' | 'preview',
  mime: string,
  nowMs: number = Date.now(),
): string {
  return `${prefix}${nowMs}-${crypto.randomUUID().slice(0, 8)}-${role}.${extForImageMime(mime)}`;
}

/** Exactly one path segment after the owner's prefix — no traversal, no nesting. */
export function isOwnedDropPath(path: unknown, prefix: string): path is string {
  if (typeof path !== 'string' || !path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[0-9]{10,16}-[0-9a-f]{8}-(original|preview)\.(jpg|png|webp|heic|heif)$/.test(rest);
}

/**
 * Uploads a drop's original and its pixelated preview (event and shared drops; chat originals are
 * E2EE and go through /api/chat/media). Both or neither: a half upload is removed.
 */
export async function uploadDropRenditions(
  admin: SupabaseClient,
  prefix: string,
  mimeType: string,
  original: Buffer,
  preview: Buffer,
): Promise<{ originalPath: string; previewPath: string } | null> {
  const originalPath = newDropObjectPath(prefix, 'original', mimeType);
  const previewPath = newDropObjectPath(prefix, 'preview', 'image/jpeg');
  const bucket = admin.storage.from(DROPS_BUCKET);
  const [a, b] = await Promise.all([
    bucket.upload(originalPath, original, { contentType: mimeType, upsert: false }),
    bucket.upload(previewPath, preview, { contentType: 'image/jpeg', upsert: false }),
  ]);
  if (a.error || b.error) {
    console.error('[drops] upload:', a.error?.message ?? b.error?.message);
    await removeDropObjects(admin, [originalPath, previewPath]);
    return null;
  }
  return { originalPath, previewPath };
}

/** Decodes a base64 upload within a byte limit; null when empty or too large. */
export function decodeDropUpload(b64: string, maxBytes: number): Buffer | null {
  if (b64.length > Math.ceil(maxBytes / 3) * 4 + 4) return null;
  const buffer = Buffer.from(b64, 'base64');
  return buffer.length > 0 && buffer.length <= maxBytes ? buffer : null;
}

export const DROP_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const DROP_MAX_PREVIEW_BYTES = 1024 * 1024;

/** Signed URLs keyed by path; a path that fails to sign is simply absent. */
export async function signDropObjects(
  admin: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const { data, error } = await admin.storage
    .from(DROPS_BUCKET)
    .createSignedUrls(unique, DROP_SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('[drops] sign:', error.message);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Best-effort removal (delete flows log, never fail, on storage errors). */
export async function removeDropObjects(admin: SupabaseClient, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(DROPS_BUCKET).remove(unique.slice(i, i + 100));
    if (error) console.warn('[drops] remove:', error.message);
  }
}

/**
 * Account deletion: rows cascade with auth.users, Storage objects don't. Removes every drop object
 * the user uploaded (their registry rows name them) before the account goes.
 */
export async function removeAllDropMediaForUser(admin: SupabaseClient, userId: string): Promise<void> {
  const [chat, event, shared] = await Promise.all([
    admin.from('chat_drop_originals').select('object_path').eq('sender_id', userId),
    admin.from('event_drops').select('original_path, preview_path').eq('user_id', userId),
    admin.from('shared_drops').select('original_path, preview_path').eq('user_id', userId),
  ]);
  const failed = chat.error ?? event.error ?? shared.error;
  if (failed) console.warn('[drops] account deletion lookup:', failed.message);
  const renditions = (rows: unknown) =>
    ((rows ?? []) as Array<{ original_path: string; preview_path: string }>).flatMap((r) => [r.original_path, r.preview_path]);
  await removeDropObjects(admin, [
    ...((chat.data ?? []) as Array<{ object_path: string }>).map((r) => r.object_path),
    ...renditions(event.data),
    ...renditions(shared.data),
  ]);
}

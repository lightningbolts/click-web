/**
 * Beacon photos live in the public `avatars` bucket.
 *
 * Storage RLS (`avatars_insert_own_prefix`) requires the first path segment to be
 * `auth.uid()`. Avatar uploads already use `{userId}/...`; beacon photos must match.
 * The previous `beacons/{userId}/...` layout failed INSERT because the first segment
 * was the literal `beacons`.
 */
export function beaconPhotoObjectPath(
  userId: string,
  ext: string,
  nowMs: number = Date.now(),
  unique: string = globalThis.crypto.randomUUID(),
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
  const safeUnique = unique.replace(/[^a-z0-9-]/gi, '') || 'id';
  return `${userId}/beacons/${nowMs}-${safeUnique}.${safeExt}`;
}

/** True when an object key is owned by [userId] under either current or legacy layout. */
export function isBeaconPhotoPathOwnedByUser(objectName: string, userId: string): boolean {
  const parts = objectName.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[0] === userId) return true;
  return parts[0] === 'beacons' && parts[1] === userId;
}

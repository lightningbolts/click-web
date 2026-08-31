export const IMAGE_UPLOAD_MAX_BYTES = 2_000_000;

export const UPLOAD_FALLBACK_ERROR =
  'Upload failed — try a smaller file or a different format';

export const COVER_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const AVATAR_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;

export const COVER_IMAGE_ACCEPT = COVER_IMAGE_MIME_TYPES.join(',');

export const AVATAR_IMAGE_ACCEPT = 'image/jpeg,image/png';

export const BEACON_IMAGE_ENDPOINT = '/api/beacons/image';

export const USER_AVATAR_ENDPOINT = '/api/user/avatar';

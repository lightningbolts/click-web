import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  UPLOAD_FALLBACK_ERROR,
} from '@/lib/uploads/constants';

export type ImageUploadConfig = {
  endpoint: string;
  acceptedMimeTypes: readonly string[];
  maxBytes?: number;
};

export type ImageUploadValidationError = {
  ok: false;
  error: string;
};

export type ImageUploadSuccess = {
  ok: true;
  url: string;
};

export type ImageUploadFailure = {
  ok: false;
  error: string;
};

export type ImageUploadResult = ImageUploadSuccess | ImageUploadFailure;

type NormalizedImageUploadResponse = {
  url: string | null;
  serverError: string | null;
};

function normalizeMime(mime: string): string {
  return mime.toLowerCase().split(';')[0]?.trim() ?? '';
}

export function isAcceptedImageMime(
  mime: string,
  acceptedMimeTypes: readonly string[],
): boolean {
  const normalized = normalizeMime(mime);
  return acceptedMimeTypes.some((candidate) => normalizeMime(candidate) === normalized);
}

export function formatAcceptedMimeLabels(acceptedMimeTypes: readonly string[]): string {
  const labels = new Set<string>();
  for (const mime of acceptedMimeTypes) {
    const normalized = normalizeMime(mime);
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') labels.add('JPG');
    else if (normalized === 'image/png') labels.add('PNG');
    else if (normalized === 'image/webp') labels.add('WebP');
    else if (normalized === 'image/gif') labels.add('GIF');
  }
  return Array.from(labels).join(', ');
}

export function validateImageFile(
  file: File,
  acceptedMimeTypes: readonly string[],
  maxBytes: number = IMAGE_UPLOAD_MAX_BYTES,
): ImageUploadValidationError | null {
  const mime = file.type?.trim() || '';
  if (!mime || !isAcceptedImageMime(mime, acceptedMimeTypes)) {
    const labels = formatAcceptedMimeLabels(acceptedMimeTypes);
    return {
      ok: false,
      error: `Only ${labels} are supported.`,
    };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: 'Image must be under 2 MB.',
    };
  }
  return null;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const marker = 'base64,';
      const markerIndex = result.indexOf(marker);
      resolve(markerIndex >= 0 ? result.slice(markerIndex + marker.length) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function normalizeImageUploadResponse(json: unknown): NormalizedImageUploadResponse {
  if (typeof json !== 'object' || json === null) {
    return { url: null, serverError: null };
  }
  const body = json as { image?: unknown; error?: unknown };
  const url =
    typeof body.image === 'string' && body.image.trim().length > 0 ? body.image.trim() : null;
  const serverError =
    typeof body.error === 'string' && body.error.trim().length > 0 ? body.error.trim() : null;
  return { url, serverError };
}

export async function uploadImageFile(
  file: File,
  config: ImageUploadConfig,
): Promise<ImageUploadResult> {
  const maxBytes = config.maxBytes ?? IMAGE_UPLOAD_MAX_BYTES;
  const validationError = validateImageFile(file, config.acceptedMimeTypes, maxBytes);
  if (validationError) {
    return validationError;
  }

  try {
    const fileB64 = await fileToBase64(file);
    const headers = await getFreshAuthHeaders();
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file_b64: fileB64,
        mime_type: file.type || 'image/jpeg',
      }),
    });

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    const { url } = normalizeImageUploadResponse(json);
    if (!res.ok || !url) {
      return { ok: false, error: UPLOAD_FALLBACK_ERROR };
    }

    return { ok: true, url };
  } catch {
    return { ok: false, error: UPLOAD_FALLBACK_ERROR };
  }
}

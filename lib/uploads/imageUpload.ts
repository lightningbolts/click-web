import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  UPLOAD_FALLBACK_ERROR,
} from '@/lib/uploads/constants';

export type ImageUploadConfig = {
  endpoint: string;
  acceptedMimeTypes: readonly string[];
  maxBytes?: number;
  compressOversize?: boolean;
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
      mimeType,
      quality,
    );
  });
}

export async function compressImageFile(
  file: File,
  maxBytes: number = IMAGE_UPLOAD_MAX_BYTES,
): Promise<File> {
  if (file.size <= maxBytes) return file;

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();

    const maxDimension = 2560;
    const initialScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let quality = 0.9;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is unavailable');
      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (blob.size <= maxBytes) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
        return new File([blob], `${baseName}.webp`, {
          type: 'image/webp',
          lastModified: Date.now(),
        });
      }

      if (quality > 0.55) {
        quality -= 0.1;
      } else {
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
        quality = 0.82;
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error('Image could not be compressed below 2 MB');
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
  const typeValidationError = validateImageFile(
    file,
    config.acceptedMimeTypes,
    Number.MAX_SAFE_INTEGER,
  );
  if (typeValidationError) {
    return typeValidationError;
  }

  let uploadFile = file;
  if (file.size > maxBytes && config.compressOversize) {
    try {
      uploadFile = await compressImageFile(file, maxBytes);
    } catch {
      return { ok: false, error: 'Image could not be compressed below 2 MB.' };
    }
  }

  const validationError = validateImageFile(uploadFile, config.acceptedMimeTypes, maxBytes);
  if (validationError) {
    return validationError;
  }

  try {
    const fileB64 = await fileToBase64(uploadFile);
    const headers = await getFreshAuthHeaders();
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file_b64: fileB64,
        mime_type: uploadFile.type || 'image/jpeg',
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

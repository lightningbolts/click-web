/**
 * Browser-side encoding for a new drop: a re-encoded JPEG original (long edge ≤ 2048, which also
 * strips EXIF/location) and the pixelated teaser shown before it develops, matching iOS.
 */
export type EncodedDrop = {
  mime_type: 'image/jpeg';
  original_b64: string;
  preview_b64: string;
  width: number;
  height: number;
};

const ORIGINAL_MAX_EDGE = 2048;
const PIXEL_GRID = 16;
const PREVIEW_MAX_EDGE = 320;

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToBase64(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
}

export async function encodeDropImage(file: File): Promise<EncodedDrop> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('This photo format isn’t supported here. Try a JPEG or PNG.');
  });
  try {
    const size = fit(bitmap.width, bitmap.height, ORIGINAL_MAX_EDGE);
    const original = document.createElement('canvas');
    original.width = size.width;
    original.height = size.height;
    original.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);

    // Pixelate: shrink to a coarse grid, then scale back up without smoothing.
    const grid = fit(size.width, size.height, PIXEL_GRID);
    const small = document.createElement('canvas');
    small.width = grid.width;
    small.height = grid.height;
    small.getContext('2d')!.drawImage(original, 0, 0, grid.width, grid.height);
    const previewSize = fit(size.width, size.height, PREVIEW_MAX_EDGE);
    const preview = document.createElement('canvas');
    preview.width = previewSize.width;
    preview.height = previewSize.height;
    const ctx = preview.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, previewSize.width, previewSize.height);

    return {
      mime_type: 'image/jpeg',
      original_b64: canvasToBase64(original, 0.86),
      preview_b64: canvasToBase64(preview, 0.7),
      width: size.width,
      height: size.height,
    };
  } finally {
    bitmap.close();
  }
}

import 'server-only';

import { cloudflareEnv } from '@/lib/server/cloudflareEnv';
import { gradientPng, type Rgb } from '@/lib/server/wallet/png';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';

/** The slice of Cloudflare's Images binding the pass uses (`env.IMAGES`). */
type ImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string }): Promise<{ response(): Response }>;
    };
  };
};

export type PassArt = {
  /** Wallet image files (`background.png`, `thumbnail.png`, …) for this event. */
  images: Record<string, Buffer>;
  /** Shown while Wallet draws the background, and the backing for its blur. */
  backgroundColor: Rgb;
};

const PHOTO_TIMEOUT_MS = 4000;
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Toward black, so white type reads on it. */
function deepened([r, g, b]: Rgb, keep = 0.55): Rgb {
  return [Math.round(r * keep), Math.round(g * keep), Math.round(b * keep)];
}

export function cssRgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function imagesBinding(): ImagesBinding | null {
  const binding = cloudflareEnv()?.IMAGES;
  return binding && typeof (binding as ImagesBinding).input === 'function' ? (binding as ImagesBinding) : null;
}

/** The body, unless it's empty or runs past `max` bytes (stopped there, never fully buffered). */
async function readCapped(response: Response, max: number): Promise<ArrayBuffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function transformed(images: ImagesBinding, bytes: ArrayBuffer, options: Record<string, unknown>): Promise<Buffer> {
  const result = await images
    .input(new Blob([bytes]).stream())
    .transform(options)
    .output({ format: 'image/png' });
  return Buffer.from(await result.response().arrayBuffer());
}

/**
 * The event's picture, twice: dimmed for the card's background (Wallet blurs it into a wash of
 * the picture's colors) and whole for the thumbnail beside the title. Null when there's no
 * picture, no Images binding, or it can't be fetched in time; the pass then wears the event's
 * generated colors instead.
 */
async function photoArt(imageUrl: string | null): Promise<Record<string, Buffer> | null> {
  const images = imagesBinding();
  if (!images || !imageUrl || !/^https:\/\//i.test(imageUrl)) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > PHOTO_MAX_BYTES) return null;
    const bytes = await readCapped(response, PHOTO_MAX_BYTES);
    if (!bytes) return null;
    const [background, thumbnail] = await Promise.all([
      transformed(images, bytes, { width: 180, height: 220, fit: 'cover', brightness: 0.62, saturation: 1.15 }),
      // 90 pt at 3×; its own shape (Wallet takes 2:3 to 3:2), never cropped.
      transformed(images, bytes, { width: 270, height: 270, fit: 'scale-down' }),
    ]);
    // One file per scale name: Wallet fits each to its slot, so the larger rendering serves all.
    return {
      'background.png': background,
      'background@2x.png': background,
      'background@3x.png': background,
      'thumbnail.png': thumbnail,
      'thumbnail@2x.png': thumbnail,
      'thumbnail@3x.png': thumbnail,
    };
  } catch (e) {
    console.warn('Wallet pass picture unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The pass's artwork: the event's picture when it has one, else its generated colors. */
export async function passArt(event: { image_url: string | null; visual_seed: string }): Promise<PassArt> {
  const stops = generateCardVisual(event.visual_seed).gradient.map(rgb);
  const from = deepened(stops[0]!);
  const to = deepened(stops[stops.length - 1]!, 0.4);
  const photo = await photoArt(event.image_url);
  const images = photo ?? { 'background.png': gradientPng(60, 74, from, to) };
  return { images, backgroundColor: deepened(from, 0.7) };
}

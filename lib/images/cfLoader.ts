'use client';

/**
 * next/image loader (spec §11.6).
 *
 * Cloudflare Image Resizing is not enabled on the joinclick.co zone (`/cdn-cgi/image`
 * returns 404), so user media in Supabase Storage is resized by Supabase's image
 * transform endpoint instead: `/storage/v1/object/public/…` → `/storage/v1/render/image/public/…`.
 * It negotiates WebP/AVIF from the Accept header. Everything else (bundled `/public`
 * art, third-party URLs) is served as-is; the `w` query keeps each srcset entry unique.
 */
const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

export type ImageLoaderArgs = { src: string; width: number; quality?: number };

export function supabaseRenderUrl(src: string, width: number, quality = 75): string | null {
  const at = src.indexOf(OBJECT_SEGMENT);
  if (at === -1 || !/^https?:\/\//.test(src)) return null;
  const [base, query] = src.split('?');
  const path = base.slice(at + OBJECT_SEGMENT.length);
  const params = new URLSearchParams(query);
  params.set('width', String(width));
  params.set('quality', String(quality));
  params.set('resize', 'cover');
  return `${base.slice(0, at)}${RENDER_SEGMENT}${path}?${params.toString()}`;
}

export default function cfLoader({ src, width, quality }: ImageLoaderArgs): string {
  const rendered = supabaseRenderUrl(src, width, quality);
  if (rendered) return rendered;
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  return `${src}${src.includes('?') ? '&' : '?'}w=${width}`;
}

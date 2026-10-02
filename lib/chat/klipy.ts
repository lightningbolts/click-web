/**
 * KLIPY GIF API client (https://docs.klipy.com/gifs-api). KLIPY requires requests to come from
 * the end-user's browser, not a Click server, so this runs client-side with the public app key.
 */

const KLIPY_API_BASE = 'https://api.klipy.com/api/v1';
const PER_PAGE = 24;
const CONTENT_FILTER = 'medium';

type KlipyRendition = { url?: string; width?: number; height?: number; size?: number };
type KlipySize = Partial<Record<'gif' | 'webp' | 'jpg' | 'mp4' | 'webm', KlipyRendition>>;

export type KlipyGifItem = {
  id: number;
  slug: string;
  title?: string;
  type?: string;
  blur_preview?: string;
  file?: Partial<Record<'hd' | 'md' | 'sm' | 'xs', KlipySize>>;
};

export type KlipyPage = { items: KlipyGifItem[]; page: number; hasNext: boolean };

export type GifRendition = { url: string; width: number; height: number };

export function klipyAppKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KLIPY_APP_KEY?.trim();
  return key ? key : null;
}

function rendition(item: KlipyGifItem, sizes: Array<'hd' | 'md' | 'sm' | 'xs'>): GifRendition | null {
  // Animated WebP is far smaller than GIF and every supported browser and iOS (ImageIO) animate it.
  for (const size of sizes) {
    for (const format of ['webp', 'gif'] as const) {
      const r = item.file?.[size]?.[format];
      if (r?.url && r.width && r.height) return { url: r.url, width: r.width, height: r.height };
    }
  }
  return null;
}

/** Grid thumbnail. */
export function klipyPreviewRendition(item: KlipyGifItem): GifRendition | null {
  return rendition(item, ['sm', 'xs', 'md']);
}

/** What gets sent: sharp at bubble size without the multi-MB `hd` GIF. */
export function klipySendRendition(item: KlipyGifItem): GifRendition | null {
  return rendition(item, ['md', 'hd', 'sm']);
}

/** Stable, non-identifying per-user ID for KLIPY personalization (never the raw user ID). */
export async function klipyCustomerId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`click-klipy:${userId}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

function localeParam(): string | null {
  if (typeof navigator === 'undefined') return null;
  const region = navigator.language?.split('-')[1];
  return region && /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : null;
}

export async function fetchKlipyGifs(params: {
  query: string;
  page: number;
  customerId: string;
  signal?: AbortSignal;
}): Promise<KlipyPage> {
  const key = klipyAppKey();
  if (!key) throw new Error('GIF search is not configured');
  const q = params.query.trim();
  const search = new URLSearchParams({
    page: String(params.page),
    per_page: String(PER_PAGE),
    customer_id: params.customerId,
    content_filter: CONTENT_FILTER,
    format_filter: 'gif,webp',
  });
  if (q) search.set('q', q);
  const locale = localeParam();
  if (locale) search.set('locale', locale);
  const endpoint = q ? 'search' : 'trending';
  const res = await fetch(`${KLIPY_API_BASE}/${encodeURIComponent(key)}/gifs/${endpoint}?${search}`, {
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`KLIPY ${endpoint} failed (${res.status})`);
  const json = (await res.json()) as {
    result?: boolean;
    data?: { data?: KlipyGifItem[]; current_page?: number; has_next?: boolean };
  };
  const items = Array.isArray(json.data?.data) ? json.data.data : [];
  return {
    items,
    page: json.data?.current_page ?? params.page,
    hasNext: json.data?.has_next === true,
  };
}

/** Share analytics (improves ranking). Fire-and-forget; failures never block the send. */
export function triggerKlipyShare(slug: string, customerId: string, query: string): void {
  const key = klipyAppKey();
  if (!key || !slug) return;
  void fetch(`${KLIPY_API_BASE}/${encodeURIComponent(key)}/gifs/share/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, q: query.trim() }),
    keepalive: true,
  }).catch(() => {});
}

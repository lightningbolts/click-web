'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';

/** Long enough to skip links the pointer only crosses, short enough to win most of the hover. */
const HOVER_DELAY_MS = 50;
/** Don't ask the router again for the same URL within this window (it dedupes too). */
const REPEAT_MS = 30_000;

/**
 * The in-app path a link would open, or null when it shouldn't be prefetched: other origins,
 * new tabs, downloads, API/auth routes, files (`.ics`, images) and the current page.
 */
export function prefetchTarget(anchor: HTMLAnchorElement, here: { href: string; origin: string; pathname: string; search: string }): string | null {
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download') || anchor.dataset.noPrefetch != null) return null;
  const raw = anchor.getAttribute('href');
  if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|click):/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, here.href);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (/^\/(api|auth)(\/|$)/.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.pathname + url.search;
}

/**
 * Full-prefetches a page the moment someone shows intent to open it: 50 ms of hover, a touch
 * starting, or keyboard focus. Next's default viewport prefetch stops at a dynamic route's
 * `loading.tsx`; this fetches the page itself, so most clicks land on a finished page instead
 * of a skeleton. One delegated listener covers every in-app link, `<Link>` or plain `<a>`.
 */
export function IntentPrefetch() {
  const router = useRouter();

  useEffect(() => {
    const sent = new Map<string, number>();
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let hovered: HTMLAnchorElement | null = null;

    const prefetch = (anchor: HTMLAnchorElement) => {
      const target = prefetchTarget(anchor, window.location);
      if (!target) return;
      const now = Date.now();
      if (now - (sent.get(target) ?? 0) < REPEAT_MS) return;
      sent.set(target, now);
      router.prefetch(target, { kind: 'full' as PrefetchKind });
    };
    const anchorFrom = (e: Event) =>
      e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
    const cancelHover = () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = null;
      hovered = null;
    };

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const anchor = anchorFrom(e);
      if (anchor === hovered) return;
      cancelHover();
      if (!anchor) return;
      hovered = anchor;
      hoverTimer = setTimeout(() => prefetch(anchor), HOVER_DELAY_MS);
    };
    const onPointerDown = (e: PointerEvent) => {
      const anchor = anchorFrom(e);
      if (anchor) prefetch(anchor);
    };
    const onFocusIn = (e: FocusEvent) => {
      const anchor = anchorFrom(e);
      if (anchor) prefetch(anchor);
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelHover();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [router]);

  return null;
}

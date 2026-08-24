/**
 * MapLibre `transformRequest` helper: same-origin URLs become `about:blank`
 * so tiles/glyphs never proxy through the Next/Cloudflare Worker.
 */
export function dropSameOriginMapRequest(url: string): { url: string } {
  if (typeof window === "undefined") return { url };
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) {
      return { url: "about:blank" };
    }
  } catch {
    /* keep the original url */
  }
  return { url };
}

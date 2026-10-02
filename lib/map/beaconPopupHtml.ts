/**
 * URL safety checks for beacon media shown on the map (the selection panel renders in React;
 * the old HTML popups are gone).
 */

/** Apple / CDN hosts used for iTunes ~30s preview streams (m4a). */
export function isSafeBeaconPreviewUrl(uri: string): boolean {
  const t = uri.trim();
  if (!/^https:\/\//i.test(t)) return false;
  let host: string;
  try {
    host = new URL(t).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host.endsWith(".mzstatic.com") ||
    host.endsWith(".itunes.apple.com") ||
    host === "audio-ssl.itunes.apple.com" ||
    (host.endsWith(".apple.com") && host.includes("audio"))
  );
}

export function isSafeBeaconImageUrl(uri: string): boolean {
  const t = uri.trim();
  if (!/^https:\/\//i.test(t)) return false;
  try {
    const h = new URL(t).hostname.toLowerCase();
    return (
      h.endsWith(".mzstatic.com") ||
      h.endsWith(".apple.com") ||
      h.endsWith(".scdn.co") ||
      h.endsWith(".spotifycdn.com") ||
      h.endsWith(".ggpht.com") ||
      h.includes("supabase.co") ||
      h.includes("supabase.in")
    );
  } catch {
    return false;
  }
}

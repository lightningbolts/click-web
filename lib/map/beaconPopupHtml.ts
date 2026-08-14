/**
 * HTML for MapLibre beacon popups (dashboard Connection Map). Values come from `GET /api/beacons/:id`.
 */

import { generateCardVisual, beaconPinShapeFor } from "@/lib/ui/generateCardVisual";
import { escapeHtml } from "@/lib/dashboard/connectionExtras";
import {
  displayTitleForBeacon,
  humanizeBeaconType,
  isSafeBeaconUri,
  type MapBeaconRecord,
} from "./mapBeacons";

function str(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

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

function firstListenHref(meta: Record<string, unknown>): string | null {
  const candidates = [
    str(meta, "spotify_playlist_uri"),
    str(meta, "spotify_url"),
    str(meta, "music_url"),
    str(meta, "original_url"),
    str(meta, "url"),
    str(meta, "link"),
    str(meta, "apple_music_url"),
  ];
  for (const c of candidates) {
    if (c && isSafeBeaconUri(c)) return c;
  }
  return null;
}

/**
 * Rich popup markup for a beacon row (caller must only pass server-trusted `MapBeaconRecord` JSON).
 */
export function formatBeaconPopupHtml(beacon: MapBeaconRecord): string {
  const m = beacon.metadata;
  const heading = escapeHtml(displayTitleForBeacon(beacon));
  const typeLine = escapeHtml(humanizeBeaconType(beacon.beacon_type));
  const official =
    beacon.beacon_type === "soundtrack" && Boolean(m.is_official === true || m.is_official === "true");
  const officialPill = official
    ? `<span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;background:rgba(34,211,238,0.18);color:#a5f3fc;">Official</span>`
    : "";

  const album = str(m, "album");
  const albumLine =
    album && beacon.beacon_type === "soundtrack"
      ? `<div style="font-size:11px;color:#a1a1aa;margin-top:4px;">${escapeHtml(album)}</div>`
      : "";

  const artRaw = str(m, "album_art_url", "artworkUrl100", "artwork_url", "image_url", "cover_url");
  const art =
    artRaw && isSafeBeaconImageUrl(artRaw)
      ? `<img src="${escapeHtml(artRaw)}" alt="" width="240" height="240" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin:10px 0 0;display:block;" />`
      : "";

  const previewRaw = str(m, "preview_url");
  const preview =
    previewRaw && isSafeBeaconPreviewUrl(previewRaw)
      ? `<div style="margin-top:12px;">
          <div style="font-size:10px;color:#71717a;margin-bottom:4px;">30-second preview</div>
          <audio controls preload="metadata" controlsList="nodownload noplaybackrate" style="width:100%;height:36px;" src="${escapeHtml(previewRaw)}"></audio>
        </div>`
      : beacon.beacon_type === "soundtrack" && !previewRaw
        ? `<p style="font-size:11px;color:#71717a;margin-top:10px;line-height:1.4;">No preview is available for this pin yet.</p>`
        : "";

  const listen = firstListenHref(m);
  const listenBlock = listen
    ? `<a href="${escapeHtml(listen)}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:12px;color:#67e8f9;font-size:12px;font-weight:600;">Open in music app →</a>`
    : "";

  const visual = generateCardVisual(beacon.id, beaconPinShapeFor(beacon.beacon_type));
  const gradient = visual.gradient.join(", ");

  return `<div style="color:${visual.onContent};background:linear-gradient(135deg, ${gradient});padding:12px 14px;border-radius:12px;border:1px solid #27272a;max-width:280px;position:relative;">
    <div style="position:absolute;inset:0;background:${visual.contentScrim};border-radius:12px;pointer-events:none;"></div>
    <div style="position:relative;">
    ${art}
    <div style="font-weight:600;color:${visual.onContent};font-size:14px;line-height:1.35;margin-top:${art ? "8px" : "0"};">${heading}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.82);margin-top:4px;">${typeLine}</div>
    ${officialPill}
    ${albumLine}
    ${preview}
    ${listenBlock}
    </div>
  </div>`;
}

export function beaconPopupErrorHtml(message: string): string {
  return `<div style="color:#fff;background:#18181b;padding:14px 16px;border-radius:12px;border:1px solid #27272a;max-width:240px;font-size:12px;color:#fca5a5;">${escapeHtml(message)}</div>`;
}

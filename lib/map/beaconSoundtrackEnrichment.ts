/**
 * Soundtrack beacon helpers: validate share URLs, resolve a search term, and enrich
 * metadata with iTunes 30s preview + artwork (public Search API).
 */

const ITUNES_SEARCH = "https://itunes.apple.com/search";

export type ItunesSongHit = {
  previewUrl: string;
  artworkUrl100: string;
  trackName: string;
  artistName: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Host allowlist for user-submitted music links (POST). */
export function isAllowedMusicShareUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "open.spotify.com" ||
    host.endsWith(".open.spotify.com") ||
    host === "spotify.link" ||
    host.endsWith(".spotify.link") ||
    host === "music.apple.com" ||
    host.endsWith(".music.apple.com") ||
    host === "itunes.apple.com" ||
    host.endsWith(".itunes.apple.com") ||
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "music.youtube.com" ||
    host.endsWith(".music.youtube.com")
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { method: "GET", next: { revalidate: 0 } });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

function pickAppleCatalogId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const i = u.searchParams.get("i");
    if (i != null && /^\d+$/.test(i)) return i;
    const path = u.pathname;
    const m = /\/id(\d+)/.exec(path);
    if (m) return m[1] ?? null;
  } catch {
    return null;
  }
  return null;
}

async function oEmbedTitle(pageUrl: string, endpoint: string): Promise<string | null> {
  const u = `${endpoint}?format=json&url=${encodeURIComponent(pageUrl)}`;
  const json = await fetchJson(u);
  if (!isRecord(json)) return null;
  const t = json.title;
  return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
}

/**
 * Best-effort title/artist phrase for iTunes search from a streaming URL.
 */
export async function resolveItunesSearchTermFromMusicUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  const appleId = pickAppleCatalogId(trimmed);
  if (appleId != null) {
    const lookup = await fetchJson(`https://itunes.apple.com/lookup?id=${appleId}&entity=song`);
    if (isRecord(lookup) && Array.isArray(lookup.results)) {
      const trackRow = lookup.results.find(
        (r) =>
          isRecord(r) &&
          typeof r.previewUrl === "string" &&
          (r.kind === "song" || r.wrapperType === "track"),
      );
      if (isRecord(trackRow)) {
        const name = typeof trackRow.trackName === "string" ? trackRow.trackName : "";
        const artist = typeof trackRow.artistName === "string" ? trackRow.artistName : "";
        const q = `${artist} ${name}`.trim();
        if (q.length > 0) return q;
      }
    }
  }

  if (lower.includes("spotify.com") || lower.includes("spotify.link")) {
    const title = await oEmbedTitle(trimmed, "https://open.spotify.com/oembed");
    if (title) return normalizeSpotifyOembedTitle(title);
  }

  if (lower.includes("youtube.com") || lower.includes("youtu.be") || lower.includes("music.youtube.com")) {
    const title = await oEmbedTitle(trimmed, "https://www.youtube.com/oembed");
    if (title) return normalizeYoutubeOembedTitle(title);
  }

  if (lower.includes("music.apple.com") || lower.includes("itunes.apple.com")) {
    const title = await oEmbedTitle(trimmed, "https://embed.music.apple.com/oembed");
    if (title) return title;
  }

  return null;
}

function normalizeSpotifyOembedTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  const by = /\s+by\s+/i.exec(t);
  if (by && by.index != null && by.index > 0) {
    const track = t.slice(0, by.index).trim();
    const artist = t.slice(by.index + by[0].length).trim();
    if (track.length > 0 && artist.length > 0) return `${artist} ${track}`;
  }
  return t;
}

function normalizeYoutubeOembedTitle(title: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*\(official[^)]*\)\s*$/i, "").trim();
  t = t.replace(/\s*\[official[^]]*]\s*$/i, "").trim();
  const seps = [" - ", " – ", " — ", " · "];
  for (const s of seps) {
    if (t.includes(s)) {
      const [a, b] = t.split(s, 2).map((x) => x.trim());
      if (a.length > 2 && b.length > 2) {
        return `${a} ${b}`;
      }
    }
  }
  return t;
}

export async function fetchItunesFirstSong(term: string): Promise<ItunesSongHit | null> {
  const q = term.trim();
  if (q.length < 2) return null;
  const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(q)}&entity=song&limit=25`;
  const json = await fetchJson(url);
  if (!isRecord(json)) return null;
  const results = json.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const row = results.find(
    (r) => isRecord(r) && r.wrapperType === "track" && typeof r.previewUrl === "string",
  );
  if (!isRecord(row)) return null;
  const previewUrl = typeof row.previewUrl === "string" ? row.previewUrl.trim() : "";
  const artworkUrl100 = typeof row.artworkUrl100 === "string" ? row.artworkUrl100.trim() : "";
  const trackName = typeof row.trackName === "string" ? row.trackName.trim() : "";
  const artistName = typeof row.artistName === "string" ? row.artistName.trim() : "";
  if (!previewUrl || !trackName) return null;
  return {
    previewUrl,
    artworkUrl100: artworkUrl100 || "",
    trackName,
    artistName,
  };
}

export type SoundtrackMetadataEnrichment = {
  original_url: string;
  preview_url?: string;
  track_name?: string;
  artist_name?: string;
  album_art_url?: string;
};

/**
 * Merges client metadata with iTunes preview fields when [originalUrl] is a soundtrack link.
 */
export async function enrichSoundtrackMetadata(
  originalUrl: string,
  base: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...base };
  const trimmed = originalUrl.trim();
  if (!isAllowedMusicShareUrl(trimmed)) return out;

  const term = await resolveItunesSearchTermFromMusicUrl(trimmed);
  if (term == null) {
    out.original_url = trimmed;
    return out;
  }

  const hit = await fetchItunesFirstSong(term);
  out.original_url = trimmed;
  if (hit == null) {
    return out;
  }
  out.preview_url = hit.previewUrl;
  out.track_name = hit.trackName;
  out.artist_name = hit.artistName;
  if (hit.artworkUrl100.length > 0) {
    out.album_art_url = hit.artworkUrl100;
  }
  out.music_url = trimmed;
  return out;
}

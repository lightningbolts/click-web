/**
 * Soundtrack beacon helpers: validate share URLs, resolve a search term, and enrich
 * metadata with iTunes preview + artwork (public Search / Lookup APIs).
 */

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const FETCH_UA =
  "Mozilla/5.0 (compatible; ClickSoundtrackEnrichment/1.0; +https://click.app)";

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

function musicHostForLog(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  attempts = 2,
): Promise<Response | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        ...init,
        headers: {
          Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
          "User-Agent": FETCH_UA,
          ...(init?.headers ?? {}),
        },
        next: { revalidate: 0 },
      });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr != null) {
    console.warn(
      "soundtrackEnrichment fetch failed:",
      musicHostForLog(url),
      lastErr instanceof Error ? lastErr.message : String(lastErr),
    );
  }
  return null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchWithRetry(url);
  if (res == null) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetchWithRetry(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (res == null) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
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

/** Normalize music.youtube.com / youtu.be share links to youtube.com/watch?v= for oEmbed. */
export function normalizeYoutubeWatchUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host === "music.youtube.com" || host.endsWith(".music.youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    if (host === "youtube.com" || host === "www.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
  } catch {
    /* keep original */
  }
  return url.trim();
}

function extractOgTitle(html: string): string | null {
  const patterns = [
    /property=["']og:title["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    const t = m?.[1]?.replace(/\s+/g, " ").trim();
    if (t && t.length > 0) return t;
  }
  return null;
}

async function oEmbedPayload(
  pageUrl: string,
  endpoint: string,
): Promise<{ title: string | null; authorName: string | null }> {
  const u = `${endpoint}?format=json&url=${encodeURIComponent(pageUrl)}`;
  const json = await fetchJson(u);
  if (!isRecord(json)) return { title: null, authorName: null };
  const title = typeof json.title === "string" && json.title.trim() ? json.title.trim() : null;
  const authorName =
    typeof json.author_name === "string" && json.author_name.trim()
      ? json.author_name.trim()
      : null;
  return { title, authorName };
}

/** Strip remaster / feat / official noise for secondary iTunes search. */
export function cleanMusicSearchNoise(term: string): string {
  let t = term.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*\((?:official|lyric|lyrics|audio|video|visualizer|remaster(?:ed)?|live|feat\.?|ft\.?)[^)]*\)/gi, "");
  t = t.replace(/\s*\[(?:official|lyric|lyrics|audio|video|visualizer|remaster(?:ed)?|live|\d{4}\s*remaster)[^\]]*]/gi, "");
  t = t.replace(/\s*-\s*topic\s*$/i, "");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Best-effort title/artist phrase candidates for iTunes search from a streaming URL.
 * Returns primary term first, then cleaned / alternate forms.
 */
export async function resolveItunesSearchTermsFromMusicUrl(url: string): Promise<string[]> {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  const terms: string[] = [];
  const push = (t: string | null | undefined) => {
    const v = t?.replace(/\s+/g, " ").trim();
    if (!v || v.length < 2) return;
    if (!terms.includes(v)) terms.push(v);
    const cleaned = cleanMusicSearchNoise(v);
    if (cleaned.length >= 2 && !terms.includes(cleaned)) terms.push(cleaned);
  };

  const appleId = pickAppleCatalogId(trimmed);
  if (appleId != null) {
    const lookup = await fetchJson(`https://itunes.apple.com/lookup?id=${appleId}&entity=song`);
    if (isRecord(lookup) && Array.isArray(lookup.results)) {
      const trackRow = lookup.results.find(
        (r) =>
          isRecord(r) &&
          (r.kind === "song" || r.wrapperType === "track") &&
          typeof r.trackName === "string",
      );
      if (isRecord(trackRow)) {
        const name = typeof trackRow.trackName === "string" ? trackRow.trackName : "";
        const artist = typeof trackRow.artistName === "string" ? trackRow.artistName : "";
        push(`${artist} ${name}`.trim());
        push(name);
      }
    }
  }

  if (lower.includes("spotify.com") || lower.includes("spotify.link")) {
    const oembed = await oEmbedPayload(trimmed, "https://open.spotify.com/oembed");
    if (oembed.title) {
      push(normalizeSpotifyOembedTitle(oembed.title));
    } else {
      const html = await fetchText(trimmed);
      if (html) {
        const og = extractOgTitle(html);
        if (og) push(normalizeSpotifyOembedTitle(og));
      }
    }
  }

  if (lower.includes("youtube.com") || lower.includes("youtu.be") || lower.includes("music.youtube.com")) {
    const watchUrl = normalizeYoutubeWatchUrl(trimmed);
    const oembed = await oEmbedPayload(watchUrl, "https://www.youtube.com/oembed");
    if (oembed.title) {
      const fromTitle = normalizeYoutubeOembedTitle(oembed.title);
      push(fromTitle);
      const author = oembed.authorName?.replace(/\s*-\s*topic\s*$/i, "").trim();
      if (author && author.length > 1) {
        push(`${author} ${cleanMusicSearchNoise(oembed.title)}`);
        push(`${author} ${fromTitle}`);
      }
    }
  }

  if (lower.includes("music.apple.com") || lower.includes("itunes.apple.com")) {
    const oembed = await oEmbedPayload(trimmed, "https://embed.music.apple.com/oembed");
    if (oembed.title) {
      push(oembed.title);
    } else {
      const html = await fetchText(trimmed);
      if (html) {
        const og = extractOgTitle(html);
        if (og) push(og);
      }
      // URL slug: /album/.../song-name/id123?i=456 → song-name
      try {
        const path = new URL(trimmed).pathname;
        const parts = path.split("/").filter(Boolean);
        const slug = parts.find((p) => !/^id\d+$/i.test(p) && !["us", "album", "song"].includes(p));
        if (slug && slug.includes("-")) {
          push(slug.replace(/-/g, " "));
        }
      } catch {
        /* ignore */
      }
    }
  }

  return terms;
}

/** @deprecated Prefer resolveItunesSearchTermsFromMusicUrl */
export async function resolveItunesSearchTermFromMusicUrl(url: string): Promise<string | null> {
  const terms = await resolveItunesSearchTermsFromMusicUrl(url);
  return terms[0] ?? null;
}

export function normalizeSpotifyOembedTitle(title: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*-\s*song and lyrics by\s+/i, " by ");
  t = t.replace(/\s*\|\s*spotify\s*$/i, "").trim();
  const by = /\s+by\s+/i.exec(t);
  if (by && by.index != null && by.index > 0) {
    const track = t.slice(0, by.index).trim();
    const artist = t.slice(by.index + by[0].length).trim();
    if (track.length > 0 && artist.length > 0) return `${artist} ${track}`;
  }
  return t;
}

export function normalizeYoutubeOembedTitle(title: string): string {
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

  // Prefer a row with preview; fall back to any named track (persist name/art without preview).
  const withPreview = results.find(
    (r) =>
      isRecord(r) &&
      r.wrapperType === "track" &&
      typeof r.trackName === "string" &&
      typeof r.previewUrl === "string" &&
      (r.previewUrl as string).trim().length > 0,
  );
  const row =
    withPreview ??
    results.find(
      (r) => isRecord(r) && r.wrapperType === "track" && typeof r.trackName === "string",
    );
  if (!isRecord(row)) return null;
  const previewUrl = typeof row.previewUrl === "string" ? row.previewUrl.trim() : "";
  const artworkUrl100 = typeof row.artworkUrl100 === "string" ? row.artworkUrl100.trim() : "";
  const trackName = typeof row.trackName === "string" ? row.trackName.trim() : "";
  const artistName = typeof row.artistName === "string" ? row.artistName.trim() : "";
  if (!trackName) return null;
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

const RICH_META_KEYS = [
  "track_name",
  "artist_name",
  "preview_url",
  "album_art_url",
] as const;

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** True when enrichment produced at least track identity (not only URLs). */
export function soundtrackMetadataHasRichFields(meta: Record<string, unknown>): boolean {
  return metaStr(meta, "track_name") != null;
}

/**
 * When relocating a deduped soundtrack, keep previously enriched identity/preview
 * if the new enrichment attempt failed open to URL-only metadata.
 */
export function mergeSoundtrackMetadataOnRelocate(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing, ...incoming };
  if (!soundtrackMetadataHasRichFields(incoming) && soundtrackMetadataHasRichFields(existing)) {
    for (const k of RICH_META_KEYS) {
      const prev = metaStr(existing, k);
      if (prev != null && !metaStr(incoming, k)) {
        out[k] = prev;
      }
    }
  }
  return out;
}

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

  const terms = await resolveItunesSearchTermsFromMusicUrl(trimmed);
  out.original_url = trimmed;
  out.music_url = trimmed;

  if (terms.length === 0) {
    console.warn("soundtrackEnrichment: no search term", musicHostForLog(trimmed));
    return out;
  }

  let hit: ItunesSongHit | null = null;
  for (const term of terms) {
    hit = await fetchItunesFirstSong(term);
    if (hit != null) break;
  }
  if (hit == null) {
    console.warn("soundtrackEnrichment: iTunes miss", musicHostForLog(trimmed), terms[0]);
    return out;
  }

  out.track_name = hit.trackName;
  if (hit.artistName) out.artist_name = hit.artistName;
  if (hit.previewUrl) out.preview_url = hit.previewUrl;
  if (hit.artworkUrl100.length > 0) {
    out.album_art_url = hit.artworkUrl100;
  }
  return out;
}

/**
 * @jest-environment node
 */

import {
  cleanMusicSearchNoise,
  enrichSoundtrackMetadata,
  fetchItunesFirstSong,
  isAllowedMusicShareUrl,
  mergeSoundtrackMetadataOnRelocate,
  normalizeSpotifyOembedTitle,
  normalizeYoutubeOembedTitle,
  normalizeYoutubeWatchUrl,
  soundtrackMetadataHasRichFields,
} from "@/lib/map/beaconSoundtrackEnrichment";

describe("isAllowedMusicShareUrl", () => {
  it("allows youtube music and spotify https urls", () => {
    expect(
      isAllowedMusicShareUrl("https://music.youtube.com/watch?v=UsdGgRL1xHc&si=x"),
    ).toBe(true);
    expect(isAllowedMusicShareUrl("https://open.spotify.com/track/abc")).toBe(true);
    expect(isAllowedMusicShareUrl("http://open.spotify.com/track/abc")).toBe(false);
  });
});

describe("normalizeYoutubeWatchUrl", () => {
  it("rewrites music.youtube.com and youtu.be to watch urls", () => {
    expect(
      normalizeYoutubeWatchUrl("https://music.youtube.com/watch?v=UsdGgRL1xHc&si=x"),
    ).toBe("https://www.youtube.com/watch?v=UsdGgRL1xHc");
    expect(normalizeYoutubeWatchUrl("https://youtu.be/UsdGgRL1xHc?si=x")).toBe(
      "https://www.youtube.com/watch?v=UsdGgRL1xHc",
    );
  });
});

describe("title normalizers", () => {
  it("normalizes youtube and spotify titles", () => {
    expect(normalizeYoutubeOembedTitle("Artist - Title (Official Video)")).toBe("Artist Title");
    expect(normalizeSpotifyOembedTitle("Cut To The Feeling by Carly Rae Jepsen")).toBe(
      "Carly Rae Jepsen Cut To The Feeling",
    );
    expect(
      normalizeSpotifyOembedTitle("Cut To The Feeling - song and lyrics by Carly Rae Jepsen | Spotify"),
    ).toBe("Carly Rae Jepsen Cut To The Feeling");
  });

  it("strips remaster noise for secondary search", () => {
    expect(cleanMusicSearchNoise("Separate Ways (Worlds Apart) [2024 Remaster]")).toBe(
      "Separate Ways (Worlds Apart)",
    );
  });
});

describe("mergeSoundtrackMetadataOnRelocate", () => {
  it("preserves rich fields when incoming enrichment is url-only", () => {
    const existing = {
      music_url: "https://music.youtube.com/watch?v=abc",
      original_url: "https://music.youtube.com/watch?v=abc",
      track_name: "Meet You Again",
      artist_name: "Ebony Loren",
      preview_url: "https://audio.example/preview.m4a",
      album_art_url: "https://art.example/a.jpg",
    };
    const incoming = {
      music_url: "https://music.youtube.com/watch?v=abc",
      original_url: "https://music.youtube.com/watch?v=abc",
    };
    const merged = mergeSoundtrackMetadataOnRelocate(existing, incoming);
    expect(merged.track_name).toBe("Meet You Again");
    expect(merged.preview_url).toBe("https://audio.example/preview.m4a");
    expect(soundtrackMetadataHasRichFields(merged)).toBe(true);
  });

  it("prefers incoming rich fields when present", () => {
    const existing = { track_name: "Old", music_url: "https://x" };
    const incoming = {
      music_url: "https://x",
      track_name: "New",
      artist_name: "Artist",
    };
    expect(mergeSoundtrackMetadataOnRelocate(existing, incoming).track_name).toBe("New");
  });
});

describe("fetchItunesFirstSong + enrichSoundtrackMetadata", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("persists track identity even when iTunes row has no previewUrl", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("itunes.apple.com/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                wrapperType: "track",
                trackName: "Separate Ways (Worlds Apart)",
                artistName: "Journey",
                artworkUrl100: "https://art.example/j.jpg",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const hit = await fetchItunesFirstSong("Journey Separate Ways");
    expect(hit).toEqual({
      previewUrl: "",
      artworkUrl100: "https://art.example/j.jpg",
      trackName: "Separate Ways (Worlds Apart)",
      artistName: "Journey",
    });
  });

  it("enriches youtube music urls via oEmbed + iTunes", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "Separate Ways (Worlds Apart)  [2024 Remaster]",
            author_name: "Journey - Topic",
          }),
          { status: 200 },
        );
      }
      if (url.includes("itunes.apple.com/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                wrapperType: "track",
                trackName: "Separate Ways (Worlds Apart) [2024 Remaster]",
                artistName: "Journey",
                previewUrl: "https://audio.example/preview.m4a",
                artworkUrl100: "https://art.example/j.jpg",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const musicUrl =
      "https://music.youtube.com/watch?v=UsdGgRL1xHc&si=84T2lMSiDv5kjqDs";
    const meta = await enrichSoundtrackMetadata(musicUrl, { music_url: musicUrl });
    expect(meta.track_name).toBe("Separate Ways (Worlds Apart) [2024 Remaster]");
    expect(meta.artist_name).toBe("Journey");
    expect(meta.preview_url).toBe("https://audio.example/preview.m4a");
    expect(meta.album_art_url).toBe("https://art.example/j.jpg");
    expect(meta.original_url).toBe(musicUrl);
  });

  it("falls back to spotify og:title when oEmbed fails", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const accept = String(
        (init?.headers as Record<string, string> | undefined)?.Accept ?? "",
      );
      if (url.includes("open.spotify.com/oembed")) {
        return new Response("{}", { status: 404 });
      }
      if (url.includes("open.spotify.com/track/") && accept.includes("text/html")) {
        return new Response(
          '<html><meta property="og:title" content="Cut To The Feeling by Carly Rae Jepsen" /></html>',
          { status: 200 },
        );
      }
      if (url.includes("itunes.apple.com/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                wrapperType: "track",
                trackName: "Cut To The Feeling",
                artistName: "Carly Rae Jepsen",
                previewUrl: "https://audio.example/c.m4a",
                artworkUrl100: "https://art.example/c.jpg",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const musicUrl = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
    const meta = await enrichSoundtrackMetadata(musicUrl, { music_url: musicUrl });
    expect(meta.track_name).toBe("Cut To The Feeling");
    expect(meta.artist_name).toBe("Carly Rae Jepsen");
  });
});

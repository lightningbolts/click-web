"use client";

import { useCallback, useState } from "react";
import { Music2, Loader2 } from "lucide-react";
import { GlassPanel } from "@/components/insights/GlassPanel";
import { postInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

type Props = {
  venueId: string | null;
};

/**
 * Verified venues: drop an official soundtrack pin at venue coordinates (Spotify playlist URI).
 */
export default function VenueBroadcastingModule({ venueId }: Props) {
  const [uri, setUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    setMessage(null);
    if (!venueId) {
      setMessage("Select a venue (venue_id) to broadcast.");
      return;
    }
    const trimmed = uri.trim();
    if (!trimmed.startsWith("spotify:playlist:")) {
      setMessage("Use a Spotify playlist URI like spotify:playlist:37i9dQZF1DXcBWIGoYBM5M");
      return;
    }
    setBusy(true);
    try {
      await postInsightsApiJson<{ beacon: unknown }>(
        `/api/insights/${encodeURIComponent(venueId)}/beacons`,
        { spotify_playlist_uri: trimmed },
      );
      setMessage("Official soundtrack published on the venue map pin.");
      setUri("");
    } catch (e) {
      const err = e as { info?: { error?: string } };
      setMessage(typeof err?.info === "object" && err.info && "error" in err.info ? String(err.info.error) : "Could not publish soundtrack");
    } finally {
      setBusy(false);
    }
  }, [uri, venueId]);

  if (!venueId) {
    return null;
  }

  return (
    <GlassPanel className="p-5" hover={false} glow="blue">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-400/25 shrink-0">
          <Music2 className="w-5 h-5 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Venue broadcasting</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Verified venues only: place an official soundtrack on your venue coordinates for the local map.
            </p>
          </div>
          <input
            type="text"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="spotify:playlist:…"
            className="w-full rounded-xl border border-border-hard bg-black/30 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-on-surface bg-cyan-600/80 hover:bg-cyan-600 border border-cyan-400/30 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Publish official soundtrack
          </button>
          {message ? <p className="text-xs text-on-surface-variant">{message}</p> : null}
        </div>
      </div>
    </GlassPanel>
  );
}

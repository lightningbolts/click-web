"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, MapPin } from "lucide-react";
import type { VibeRadarCluster } from "@/lib/insights/vibeRadar";
import { vibeCategoryColor } from "@/lib/insights/vibeRadar";

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];

function buildGeoJson(clusters: VibeRadarCluster[]) {
  return {
    type: "FeatureCollection" as const,
    features: clusters.map((c) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [c.approx_lng, c.approx_lat],
      },
      properties: {
        count: c.count,
        category: c.category,
        color: vibeCategoryColor(c.category),
      },
    })),
  };
}

export interface VibeRadarMapProps {
  clusters: VibeRadarCluster[];
  venueCenter: { lat: number | null; lng: number | null };
  /** Pulse a beacon marker at the venue after deploy. */
  showBeaconPulse?: boolean;
}

/**
 * MapLibre map: soft “hex-like” blobs from aggregated intent cells; volume → size/opacity.
 */
export default function VibeRadarMap({
  clusters,
  venueCenter,
  showBeaconPulse = false,
}: VibeRadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const beaconMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: DEFAULT_CENTER,
        zoom: 12.2,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource("vibe-intents", {
          type: "geojson",
          data: buildGeoJson(clusters),
        });

        map.addLayer({
          id: "vibe-intents-glow",
          type: "circle",
          source: "vibe-intents",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              18,
              200,
              64,
            ],
            "circle-color": ["get", "color"],
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              0.25,
              200,
              0.72,
            ],
            "circle-blur": 0.85,
          },
        });

        map.addLayer({
          id: "vibe-intents-core",
          type: "circle",
          source: "vibe-intents",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              5,
              200,
              14,
            ],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.95,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(255,255,255,0.35)",
          },
        });

        setMapLoaded(true);
        map.resize();
      });

      map.on("error", (e) => {
        console.error("VibeRadarMap:", e);
        setMapError("Failed to load map tiles");
      });

      mapRef.current = map;
    } catch (e) {
      console.error(e);
      setMapError("Failed to initialize map");
    }

    return () => {
      beaconMarkerRef.current?.remove();
      beaconMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Venue anchor when there are no cells yet
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (clusters.length > 0) return;
    if (
      venueCenter.lat != null &&
      venueCenter.lng != null &&
      Number.isFinite(venueCenter.lat) &&
      Number.isFinite(venueCenter.lng)
    ) {
      map.jumpTo({ center: [venueCenter.lng, venueCenter.lat], zoom: 12.2 });
    }
  }, [mapLoaded, clusters.length, venueCenter.lat, venueCenter.lng]);

  // Push cluster updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource("vibe-intents") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(buildGeoJson(clusters));
    }

    if (clusters.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      clusters.forEach((c) => bounds.extend([c.approx_lng, c.approx_lat]));
      map.fitBounds(bounds, { padding: 72, maxZoom: 13.5, duration: 600 });
    }
  }, [clusters, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    beaconMarkerRef.current?.remove();
    beaconMarkerRef.current = null;

    if (!showBeaconPulse) return;
    if (
      venueCenter.lat == null ||
      venueCenter.lng == null ||
      !Number.isFinite(venueCenter.lat) ||
      !Number.isFinite(venueCenter.lng)
    ) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:relative;width:0;height:0;display:flex;align-items:center;justify-content:center;";

    const pulse = document.createElement("div");
    pulse.style.cssText = `
      position:absolute;width:56px;height:56px;border-radius:9999px;
      background:radial-gradient(circle,rgba(131,56,236,0.45) 0%,transparent 70%);
      animation:vibe-beacon-pulse 1.6s ease-out infinite;
    `;
    const core = document.createElement("div");
    core.style.cssText = `
      width:16px;height:16px;border-radius:9999px;
      background:linear-gradient(135deg,#8338EC,#3A86FF);
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 0 24px rgba(131,56,236,0.85);
    `;
    wrap.appendChild(pulse);
    wrap.appendChild(core);

    if (!document.getElementById("vibe-beacon-keyframes")) {
      const style = document.createElement("style");
      style.id = "vibe-beacon-keyframes";
      style.textContent = `@keyframes vibe-beacon-pulse{0%{transform:scale(0.6);opacity:1}100%{transform:scale(2.4);opacity:0}}`;
      document.head.appendChild(style);
    }

    beaconMarkerRef.current = new maplibregl.Marker({ element: wrap })
      .setLngLat([venueCenter.lng, venueCenter.lat])
      .addTo(map);
  }, [showBeaconPulse, venueCenter.lat, venueCenter.lng, mapLoaded]);

  useEffect(() => {
    const onResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onResize);
    const t = setTimeout(onResize, 120);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [mapLoaded]);

  if (mapError) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-12 text-center">
        <MapPin className="w-14 h-14 text-red-400/90 mx-auto mb-3" />
        <p className="text-white font-medium">Map unavailable</p>
        <p className="text-sm text-zinc-500 mt-1">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-zinc-950 min-h-[420px] h-[min(56vh,620px)]">
      <AnimatePresence>
        {!mapLoaded && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
          >
            <Loader2 className="w-9 h-9 text-[#8338EC] animate-spin mb-2" />
            <p className="text-sm text-zinc-400">Loading map…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={containerRef} className="absolute inset-0" />

      {mapLoaded && clusters.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 right-4 sm:right-auto max-w-md z-[5] rounded-xl border border-white/10 bg-zinc-950/85 backdrop-blur-md px-4 py-3 text-sm text-zinc-400"
        >
          No aggregated cells in range yet. When guests share coarse area buckets with active
          intents, clusters appear here — never individual identities.
        </motion.div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, MapPin, Layers } from "lucide-react";
import type { VibeRadarCluster } from "@/lib/insights/vibeRadar";
import { vibeCategoryColor } from "@/lib/insights/vibeRadar";
import {
  type MapBeaconRecord,
  beaconGeoJsonFeatures,
  isSafeBeaconUri,
} from "@/lib/map/mapBeacons";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { mapStyleForTheme, FC_PRIMARY } from "@/lib/theme/mapStyles";
import { Toggle } from "@/components/ui/Toggle";

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];

const SRC_INTENTS = "vr-intents-geo";
const SRC_OFFICIAL = "vr-beacons-official";
const SRC_COMMUNITY = "vr-beacons-community";
const SRC_HAZARDS = "vr-beacons-hazards";

const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS = 48;

type VibeMapLayers = {
  myNetwork: boolean;
  officialSoundtracks: boolean;
  communityBeacons: boolean;
  hazards: boolean;
};

const DEFAULT_VIBE_MAP_LAYERS: VibeMapLayers = {
  myNetwork: true,
  officialSoundtracks: true,
  communityBeacons: true,
  hazards: true,
};

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function intentFeatures(clusters: VibeRadarCluster[]): GeoJSON.Feature[] {
  return clusters.map((c) => ({
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
  }));
}

/** Minimal HTML escape for map popups (labels from beacon metadata). */
function escapeMapHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface VibeRadarMapProps {
  clusters: VibeRadarCluster[];
  venueCenter: { lat: number | null; lng: number | null };
  /** Pulse a beacon marker at the venue after deploy. */
  showBeaconPulse?: boolean;
  /** Venue-scoped map beacons (managers); shown on separate clustered layers. */
  venueBeacons?: MapBeaconRecord[];
}

/**
 * MapLibre map: intent clusters + optional venue beacon layers (native GeoJSON clustering).
 */
export default function VibeRadarMap({
  clusters,
  venueCenter,
  showBeaconPulse = false,
  venueBeacons = [],
}: VibeRadarMapProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const beaconMarkerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layers, setLayers] = useState<VibeMapLayers>(() => ({ ...DEFAULT_VIBE_MAP_LAYERS }));

  const initCenterRef = useRef<[number, number] | null>(null);
  if (initCenterRef.current === null) {
    if (
      venueCenter.lat != null &&
      venueCenter.lng != null &&
      Number.isFinite(venueCenter.lat) &&
      Number.isFinite(venueCenter.lng)
    ) {
      initCenterRef.current = [venueCenter.lng, venueCenter.lat];
    } else {
      initCenterRef.current = DEFAULT_CENTER;
    }
  }

  const attachInteractions = useCallback((map: maplibregl.Map) => {
    const expandCluster = (sourceId: string) => (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const clusId = f.properties?.cluster_id;
      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (clusId == null || !src?.getClusterExpansionZoom) return;
      void src.getClusterExpansionZoom(clusId as number).then((z) => {
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: z + 0.35, duration: 420 });
      });
    };

    const onBeaconPoint = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const title = escapeMapHtml(String(f.properties?.title ?? "Beacon"));
      const typ = escapeMapHtml(String(f.properties?.beacon_type ?? ""));
      const spotifyRaw = typeof f.properties?.spotify === "string" ? f.properties.spotify : "";
      const spotify = spotifyRaw && isSafeBeaconUri(spotifyRaw) ? spotifyRaw : "";
      const open = spotify
        ? `<a href="${escapeMapHtml(spotify)}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:10px;color:#67e8f9;font-size:12px;">Open in Spotify →</a>`
        : "";
      popupRef.current?.remove();
      const html = `<div style="color:#fff;background:#18181b;padding:12px 14px;border-radius:12px;border:1px solid #27272a;max-width:240px;">
        <div style="font-weight:600;color:#e4e4e7;margin-bottom:4px;">${title}</div>
        <div style="font-size:11px;color:#a1a1aa;">${typ}</div>
        ${open}
      </div>`;
      popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    };

    map.on("click", "vr-intent-clusters", expandCluster(SRC_INTENTS));
    map.on("click", "vr-official-beacon-clusters", expandCluster(SRC_OFFICIAL));
    map.on("click", "vr-community-beacon-clusters", expandCluster(SRC_COMMUNITY));
    map.on("click", "vr-hazard-beacon-clusters", expandCluster(SRC_HAZARDS));
    map.on("click", "vr-official-beacon-unclustered", onBeaconPoint);
    map.on("click", "vr-community-beacon-unclustered", onBeaconPoint);
    map.on("click", "vr-hazard-beacon-unclustered", onBeaconPoint);

    const hoverIds = [
      "vr-intent-clusters",
      "vr-intent-unclustered",
      "vr-official-beacon-clusters",
      "vr-official-beacon-unclustered",
      "vr-community-beacon-clusters",
      "vr-community-beacon-unclustered",
      "vr-hazard-beacon-clusters",
      "vr-hazard-beacon-unclustered",
    ];
    hoverIds.forEach((id) => {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyleForTheme(theme),
        center: initCenterRef.current ?? DEFAULT_CENTER,
        zoom: 12.2,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource(SRC_INTENTS, {
          type: "geojson",
          data: emptyFc(),
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
        });

        map.addLayer({
          id: "vr-intent-clusters",
          type: "circle",
          source: SRC_INTENTS,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": FC_PRIMARY,
            "circle-radius": ["step", ["get", "point_count"], 18, 8, 22, 20, 28],
            "circle-opacity": 0.88,
            "circle-stroke-width": 2,
            "circle-stroke-color": "rgba(255,255,255,0.9)",
          },
        });
        map.addLayer({
          id: "vr-intent-cluster-count",
          type: "symbol",
          source: SRC_INTENTS,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 11,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "vr-intent-unclustered",
          type: "circle",
          source: SRC_INTENTS,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              8,
              200,
              22,
            ],
            "circle-opacity": 0.92,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(255,255,255,0.35)",
          },
        });

        const addBeaconStack = (sourceId: string, prefix: string, fallback: string) => {
          map.addSource(sourceId, {
            type: "geojson",
            data: emptyFc(),
            cluster: true,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            clusterRadius: CLUSTER_RADIUS + 4,
          });
          map.addLayer({
            id: `${prefix}-clusters`,
            type: "circle",
            source: sourceId,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": fallback,
              "circle-radius": ["step", ["get", "point_count"], 16, 6, 20, 16, 24],
              "circle-opacity": 0.88,
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(255,255,255,0.85)",
            },
          });
          map.addLayer({
            id: `${prefix}-cluster-count`,
            type: "symbol",
            source: sourceId,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 10,
            },
            paint: { "text-color": "#0a0a0a" },
          });
          map.addLayer({
            id: `${prefix}-unclustered`,
            type: "circle",
            source: sourceId,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["get", "tint"],
              "circle-radius": 10,
              "circle-opacity": 0.95,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
        };

        addBeaconStack(SRC_OFFICIAL, "vr-official-beacon", "#22d3ee");
        addBeaconStack(SRC_COMMUNITY, "vr-community-beacon", "#34d399");
        addBeaconStack(SRC_HAZARDS, "vr-hazard-beacon", "#f97316");

        attachInteractions(map);
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
      popupRef.current?.remove();
      popupRef.current = null;
      beaconMarkerRef.current?.remove();
      beaconMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [attachInteractions, theme]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource(SRC_INTENTS) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: intentFeatures(clusters) });

    if (clusters.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      clusters.forEach((c) => bounds.extend([c.approx_lng, c.approx_lat]));
      map.fitBounds(bounds, { padding: 72, maxZoom: 13.5, duration: 600 });
    }
  }, [clusters, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const setData = (id: string, feats: GeoJSON.Feature[]) => {
      (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: feats,
      });
    };
    setData(SRC_OFFICIAL, beaconGeoJsonFeatures(venueBeacons, "official"));
    setData(SRC_COMMUNITY, beaconGeoJsonFeatures(venueBeacons, "community"));
    setData(SRC_HAZARDS, beaconGeoJsonFeatures(venueBeacons, "hazard"));

    const vis = (on: boolean) => (on ? "visible" : "none");
    ["vr-intent-clusters", "vr-intent-cluster-count", "vr-intent-unclustered"].forEach((lid) => {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis(layers.myNetwork));
    });
    ["vr-official-beacon-clusters", "vr-official-beacon-cluster-count", "vr-official-beacon-unclustered"].forEach(
      (lid) => {
        if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis(layers.officialSoundtracks));
      },
    );
    ["vr-community-beacon-clusters", "vr-community-beacon-cluster-count", "vr-community-beacon-unclustered"].forEach(
      (lid) => {
        if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis(layers.communityBeacons));
      },
    );
    ["vr-hazard-beacon-clusters", "vr-hazard-beacon-cluster-count", "vr-hazard-beacon-unclustered"].forEach((lid) => {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis(layers.hazards));
    });
  }, [mapLoaded, venueBeacons, layers.myNetwork, layers.officialSoundtracks, layers.communityBeacons, layers.hazards]);

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
      background:radial-gradient(circle,rgba(124,58,237,0.45) 0%,transparent 70%);
      animation:vibe-beacon-pulse 1.6s ease-out infinite;
    `;
    const core = document.createElement("div");
    core.style.cssText = `
      width:16px;height:16px;border-radius:9999px;
      background:linear-gradient(135deg,${FC_PRIMARY},${FC_PRIMARY});
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 0 24px rgba(124,58,237,0.85);
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

  const toggle = (key: keyof VibeMapLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (mapError) {
    return (
      <div className="rounded-2xl border border-border-hard bg-surface-container p-12 text-center">
        <MapPin className="w-14 h-14 text-red-700 dark:text-red-400/90 mx-auto mb-3" />
        <p className="text-on-surface font-medium">Map unavailable</p>
        <p className="text-sm text-on-surface-variant mt-1">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-border-hard overflow-hidden bg-background min-h-[420px] h-[min(56vh,620px)]">
      <AnimatePresence>
        {!mapLoaded && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90"
          >
            <Loader2 className="w-9 h-9 text-primary animate-spin mb-2" />
            <p className="text-sm text-on-surface-variant">Loading map…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={containerRef} className="absolute inset-0" />

      {mapLoaded && (
        <div className="absolute top-3 left-3 z-[6] max-w-[220px] rounded-2xl border border-border-hard bg-background/70 shadow-lg shadow-black/40 p-3 text-xs text-on-surface">
          <div className="flex items-center gap-2 mb-2 font-semibold text-on-surface">
            <Layers className="w-3.5 h-3.5 text-primary" />
            Map layers
          </div>
          <div className="flex items-center gap-2 py-1 select-none">
            <Toggle checked={layers.myNetwork} onCheckedChange={() => toggle("myNetwork")} aria-label="Availability intents" className="scale-75" />
            Availability intents
          </div>
          <div className="flex items-center gap-2 py-1 select-none">
            <Toggle checked={layers.officialSoundtracks} onCheckedChange={() => toggle("officialSoundtracks")} aria-label="Official Soundtracks" className="scale-75" />
            Official Soundtracks
          </div>
          <div className="flex items-center gap-2 py-1 select-none">
            <Toggle checked={layers.communityBeacons} onCheckedChange={() => toggle("communityBeacons")} aria-label="Community Beacons" className="scale-75" />
            Community Beacons
          </div>
          <div className="flex items-center gap-2 py-1 select-none">
            <Toggle checked={layers.hazards} onCheckedChange={() => toggle("hazards")} aria-label="Hazards" className="scale-75" />
            Hazards
          </div>
        </div>
      )}

      {mapLoaded && clusters.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 right-4 sm:right-auto max-w-md z-[5] rounded-xl border border-border-hard bg-background/85 px-4 py-3 text-sm text-on-surface-variant"
        >
          No aggregated cells in range yet. When guests share coarse area buckets with active intents,
          clusters appear here — never individual identities.
        </motion.div>
      )}
    </div>
  );
}

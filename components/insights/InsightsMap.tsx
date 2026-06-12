"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, MapPin, Users } from "lucide-react";
import type { VerifiedConnectionMapNode } from "@/lib/insights/connectionEncounterClustering";

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];
const SRC_VERIFIED = "insights-verified-connections";

export interface InsightsMapProps {
  nodes: VerifiedConnectionMapNode[];
  venueCenter?: { lat: number | null; lng: number | null };
}

function escapeMapHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildVerifiedFeatures(nodes: VerifiedConnectionMapNode[]): GeoJSON.Feature[] {
  return nodes.map((node) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [node.longitude, node.latitude],
    },
    properties: {
      connectionId: node.connectionId,
      participantCount: node.participantCount,
      isVerifiedHandshake: node.isVerifiedHandshake,
    },
  }));
}

function buildPopupHtml(node: VerifiedConnectionMapNode): string {
  const title = node.isVerifiedHandshake
    ? "Verified Connection"
    : "Connection";
  const detail = node.isVerifiedHandshake
    ? `${node.participantCount} participants · centroid snapped for display`
    : "Single observed coordinate";
  return `<div style="color:#fff;background:#18181b;padding:12px 14px;border-radius:12px;border:1px solid #27272a;min-width:180px;">
    <strong style="color:#22d3ee;font-size:13px;display:block;margin-bottom:4px;">${escapeMapHtml(title)}</strong>
    <span style="color:#a1a1aa;font-size:11px;display:block;line-height:1.4;">${escapeMapHtml(detail)}</span>
  </div>`;
}

/**
 * B2B Click Insights map — renders verified connection nodes from client-side
 * centroid clustering of raw `connection_encounters` grouped by `connection_id`.
 */
export default function InsightsMap({ nodes, venueCenter }: InsightsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const nodesRef = useRef(nodes);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const mapCenter = useMemo((): [number, number] => {
    if (venueCenter?.lat != null && venueCenter?.lng != null) {
      return [venueCenter.lng, venueCenter.lat];
    }
    const first = nodes[0];
    if (first) return [first.longitude, first.latitude];
    return DEFAULT_CENTER;
  }, [nodes, venueCenter?.lat, venueCenter?.lng]);

  const initCenterRef = useRef<[number, number] | null>(null);
  if (initCenterRef.current === null) {
    initCenterRef.current = mapCenter;
  }

  const verifiedCount = nodes.filter((n) => n.isVerifiedHandshake).length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: initCenterRef.current ?? mapCenter,
        zoom: 13,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource(SRC_VERIFIED, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "verified-connection-nodes",
          type: "circle",
          source: SRC_VERIFIED,
          paint: {
            "circle-color": [
              "case",
              ["get", "isVerifiedHandshake"],
              "#22d3ee",
              "#8338EC",
            ],
            "circle-radius": [
              "case",
              ["get", "isVerifiedHandshake"],
              16,
              12,
            ],
            "circle-opacity": 0.92,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "verified-connection-count",
          type: "symbol",
          source: SRC_VERIFIED,
          filter: ["get", "isVerifiedHandshake"],
          layout: {
            "text-field": ["to-string", ["get", "participantCount"]],
            "text-size": 11,
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#0a0a0a",
          },
        });

        map.on("click", "verified-connection-nodes", (e) => {
          const feature = e.features?.[0];
          const connectionId = feature?.properties?.connectionId;
          if (typeof connectionId !== "string") return;
          const node = nodesRef.current.find((n) => n.connectionId === connectionId);
          if (!node) return;
          popupRef.current?.remove();
          const popup = new maplibregl.Popup({ offset: 14, closeButton: false, maxWidth: "260px" })
            .setLngLat(e.lngLat)
            .setHTML(buildPopupHtml(node));
          popup.addTo(map);
          popupRef.current = popup;
        });

        map.on("mouseenter", "verified-connection-nodes", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "verified-connection-nodes", () => {
          map.getCanvas().style.cursor = "";
        });

        setMapLoaded(true);
      });

      map.on("error", () => setMapError("Failed to load map tiles"));
    } catch {
      setMapError("Failed to initialize map");
    }

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [mapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SRC_VERIFIED) as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: buildVerifiedFeatures(nodes),
    });

    if (nodes.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      nodes.forEach((n) => bounds.extend([n.longitude, n.latitude]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    }
  }, [mapLoaded, nodes]);

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-10 text-center">
        <MapPin className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
        <p className="text-sm text-zinc-400">No verified connection coordinates yet for this venue.</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-zinc-900/80 p-10 text-center">
        <p className="text-sm text-red-400">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
      {!mapLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
          <Loader2 className="h-7 w-7 animate-spin text-[#8338EC]" />
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
      {mapLoaded && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300 backdrop-blur-md">
          <Users className="h-3.5 w-3.5 text-cyan-400" />
          <span>
            <span className="font-semibold text-cyan-300">{verifiedCount}</span> verified ·{" "}
            <span className="font-semibold text-[#8338EC]">{nodes.length}</span> nodes
          </span>
        </div>
      )}
    </div>
  );
}

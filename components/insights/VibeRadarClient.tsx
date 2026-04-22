"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Radar, Crosshair } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useInsightsDemo } from "@/components/insights/InsightsDemoContext";
import { DemoBanner } from "@/components/insights/DemoBanner";
import { GlassPanel } from "@/components/insights/GlassPanel";
import VibeRadarMap from "@/components/insights/VibeRadarMap";
import BeaconDeployModal from "@/components/insights/BeaconDeployModal";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import {
  demoVibeRadarResponse,
  type VibeRadarApiResponse,
  type VenuePopUpHubBeacon,
} from "@/lib/insights/vibeRadar";
import type { MapBeaconRecord } from "@/lib/map/mapBeacons";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

export default function VibeRadarClient({
  initialPayload,
}: {
  initialPayload: VibeRadarApiResponse | null;
}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const venueQuery = searchParams.get("venue_id");
  const { demoMode } = useInsightsDemo();
  const [modalOpen, setModalOpen] = useState(false);
  const [beaconPulse, setBeaconPulse] = useState(false);

  const intentsUrl = user
    ? `/api/insights/intents${
        venueQuery ? `?venue_id=${encodeURIComponent(venueQuery)}` : ""
      }`
    : null;

  const { data, mutate, isLoading, isValidating } = useSWR<VibeRadarApiResponse>(
    intentsUrl,
    fetchInsightsApiJson,
    {
      fallbackData: initialPayload ?? undefined,
      revalidateOnFocus: true,
    },
  );

  const venueForBeacons =
    (venueQuery && venueQuery.trim()) || data?.venueId || initialPayload?.venueId || null;
  const view = useMemo((): VibeRadarApiResponse | null => {
    if (!data) return null;
    if (!demoMode) return data;
    const sparse =
      data.status === "no_venue" ||
      (data.clusters.length === 0 && data.categoryTotals.length === 0);
    if (!sparse) return data;
    const demo = demoVibeRadarResponse();
    return {
      ...demo,
      venueId: data.venueId,
      status: data.status === "no_venue" ? "no_venue" : demo.status,
      message: data.message,
      trendingVibes: data.trendingVibes?.length ? data.trendingVibes : demo.trendingVibes,
    };
  }, [data, demoMode]);

  const beaconsListUrl =
    user && venueForBeacons && view && view.status !== "no_venue"
      ? `/api/insights/${encodeURIComponent(venueForBeacons)}/beacons`
      : null;
  const { data: venueBeaconsPayload } = useSWR<{ beacons: MapBeaconRecord[] }>(
    beaconsListUrl,
    fetchInsightsApiJson,
    { revalidateOnFocus: false },
  );
  const venueBeacons = venueBeaconsPayload?.beacons ?? [];

  const effectiveVenueId = view?.venueId ?? null;
  const demoLocked = demoMode && (!!view && view.status === "no_venue");
  const radiusMiles = (view?.radiusMeters ?? 160.934) / 1609.34;

  const onBeaconSuccess = useCallback((_beacon: VenuePopUpHubBeacon) => {
    setBeaconPulse(true);
    void mutate();
  }, [mutate]);

  useEffect(() => {
    if (!beaconPulse) return;
    const t = window.setTimeout(() => setBeaconPulse(false), 14000);
    return () => window.clearTimeout(t);
  }, [beaconPulse]);

  const clusters = view?.clusters ?? [];
  const categoryTotals = view?.categoryTotals ?? [];
  const venueCenter = view?.venueCenter ?? { lat: null, lng: null };
  const trendingVibes = view?.trendingVibes ?? [];

  const showSkeleton = !view && (isLoading || isValidating);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {demoMode ? (
        <motion.div variants={itemVariants}>
          <DemoBanner />
        </motion.div>
      ) : null}

      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#3A86FF]/20 rounded-xl border border-[#3A86FF]/35">
            <Radar className="w-5 h-5 text-[#3A86FF]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Vibe Radar</h2>
            <p className="text-sm text-zinc-500">
              Availability intents near your venue — anonymized cells only
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-white/10 border border-white/15 hover:bg-white/[0.14] hover:border-[#8338EC]/35 transition-colors"
        >
          <Crosshair className="w-4 h-4 text-[#8338EC]" />
          Deploy beacon
        </button>
      </motion.div>

      {view?.status === "venue_coordinates_required" ? (
        <motion.p variants={itemVariants} className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          Add latitude and longitude on your venue record to anchor the map and proximity window for
          this report.
        </motion.p>
      ) : null}

      <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
        <GlassPanel className="p-5 xl:col-span-3" hover={false} glow="purple">
          <h3 className="text-sm font-semibold text-white mb-1">Signal strength</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Volume drives blob size; hue reflects intent category.
          </p>
          {showSkeleton ? (
            <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
          ) : (
            <ul className="space-y-2">
              {categoryTotals.length === 0 ? (
                <li className="text-sm text-zinc-500">No totals above the privacy floor yet.</li>
              ) : (
                categoryTotals.map((t) => (
                  <li
                    key={t.category}
                    className="flex justify-between text-sm border-b border-white/5 pb-2 last:border-0"
                  >
                    <span className="text-zinc-200">{t.category}</span>
                    <span className="text-zinc-500 tabular-nums">{t.count}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </GlassPanel>

        <div className="xl:col-span-6 min-h-[420px] order-3 xl:order-none">
          {showSkeleton ? (
            <div className="h-[min(56vh,620px)] rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
          ) : (
            <VibeRadarMap
              clusters={clusters}
              venueCenter={venueCenter}
              showBeaconPulse={beaconPulse}
              venueBeacons={venueBeacons}
            />
          )}
        </div>

        <GlassPanel className="p-5 xl:col-span-3 order-2 xl:order-none" hover={false} glow="blue">
          <h3 className="text-sm font-semibold text-white mb-1">Trending vibes around you</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Beacon density by type within the same radius as intent clusters.
          </p>
          {showSkeleton ? (
            <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
          ) : trendingVibes.length === 0 ? (
            <p className="text-sm text-zinc-500">No active community map pins in range yet.</p>
          ) : (
            <ul className="space-y-2">
              {trendingVibes.map((t) => (
                <li
                  key={t.beacon_type}
                  className="flex justify-between text-sm border-b border-white/5 pb-2 last:border-0"
                >
                  <span className="text-zinc-200 capitalize">{t.beacon_type.replace(/_/g, " ")}</span>
                  <span className="text-cyan-400/90 tabular-nums font-medium">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      </motion.div>

      <BeaconDeployModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        venueId={effectiveVenueId}
        categoryTotals={categoryTotals}
        radiusMiles={radiusMiles}
        demoLocked={demoLocked}
        onBeaconSuccess={onBeaconSuccess}
      />
    </motion.div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { X, Radio, Sparkles } from "lucide-react";
import type { VibeRadarCategoryTotal, VenuePopUpHubBeacon } from "@/lib/insights/vibeRadar";
import { vibeCategoryColor } from "@/lib/insights/vibeRadar";
import { postInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

const DEFAULT_CATEGORIES = [
  "Coffee",
  "Live Music",
  "Drinks",
  "Food",
  "Networking",
  "Quiet work",
];

const DURATION_PRESETS = [
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
];

export interface BeaconDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string | null;
  categoryTotals: VibeRadarCategoryTotal[];
  radiusMiles: number;
  /** When true, treat as sample data — block real beacon POST. */
  demoLocked?: boolean;
  onBeaconSuccess?: (beacon: VenuePopUpHubBeacon) => void;
}

/**
 * Side-style modal: nearby intent breakdown + Pop-Up Hub deploy form (Radix Dialog).
 */
export default function BeaconDeployModal({
  open,
  onOpenChange,
  venueId,
  categoryTotals,
  radiusMiles,
  demoLocked = false,
  onBeaconSuccess,
}: BeaconDeployModalProps) {
  const [perk, setPerk] = useState("");
  const [category, setCategory] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const fromApi = categoryTotals.map((t) => t.category);
    const merged = [...new Set([...fromApi, ...DEFAULT_CATEGORIES])];
    return merged.slice(0, 24);
  }, [categoryTotals]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!category && categoryOptions.length > 0) {
      setCategory(categoryOptions[0]!);
    }
  }, [open, category, categoryOptions]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!venueId || demoLocked) {
        setError(demoLocked ? "Turn off demo data to deploy a live beacon." : "Link a venue first.");
        return;
      }
      const perkTrim = perk.trim();
      if (!perkTrim) {
        setError("Describe your perk or offer.");
        return;
      }
      if (!category.trim()) {
        setError("Pick an intent category to target.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await postInsightsApiJson<{ beacon: VenuePopUpHubBeacon }>(
          "/api/insights/beacons",
          {
            venue_id: venueId,
            perk_description: perkTrim,
            category_target: category.trim(),
            duration_minutes: durationMinutes,
          },
        );
        setToast("Pop-Up Hub beacon is live on your map.");
        onBeaconSuccess?.(res.beacon);
        onOpenChange(false);
        setPerk("");
      } catch (err: unknown) {
        const info = err as { info?: { error?: string }; message?: string };
        const msg =
          (typeof info.info === "object" &&
            info.info &&
            typeof (info.info as { error?: string }).error === "string" &&
            (info.info as { error: string }).error) ||
          info.message ||
          "Could not deploy beacon.";
        setError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [venueId, demoLocked, perk, category, durationMinutes, onBeaconSuccess, onOpenChange],
  );

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/55"
            />
          </Dialog.Overlay>
          <Dialog.Content asChild>
            <motion.div
              initial={{ x: 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 48, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed z-[201] right-4 top-20 bottom-6 w-[min(100%-2rem,420px)] flex flex-col rounded-2xl border border-border-hard bg-background/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] outline-none overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border-hard">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-on-surface flex items-center gap-2">
                    <Radio className="w-5 h-5 text-[#630ed4]" />
                    Deploy beacon
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Offer a perk to people broadcasting availability nearby. Counts are aggregated;
                    individual users stay anonymous.
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  type="button"
                  className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-3">
                    Active intents within {radiusMiles.toFixed(1)} mi
                  </h3>
                  {categoryTotals.length === 0 ? (
                    <p className="text-sm text-on-surface-variant py-2">
                      No category totals yet (privacy thresholds require enough nearby signals). You
                      can still target common intent labels below.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {categoryTotals.map((row) => (
                        <li
                          key={row.category}
                          className="flex items-center justify-between rounded-xl border border-border-hard bg-white/[0.04] px-3 py-2.5"
                        >
                          <span
                            className="text-sm font-medium text-on-surface flex items-center gap-2"
                            style={{ textShadow: "0 0 24px rgba(0,0,0,0.4)" }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: vibeCategoryColor(row.category) }}
                            />
                            {row.category}
                          </span>
                          <span className="text-sm text-on-surface-variant tabular-nums">
                            {row.count} users
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="beacon-perk" className="text-xs font-medium text-on-surface-variant block mb-1.5">
                      Perk or offer
                    </label>
                    <textarea
                      id="beacon-perk"
                      value={perk}
                      onChange={(e) => setPerk(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="e.g. 10% off drinks for the next two hours"
                      className="w-full rounded-xl bg-white/5 border border-border-hard px-3 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/40 resize-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="beacon-category" className="text-xs font-medium text-on-surface-variant block mb-1.5">
                      Target intent
                    </label>
                    <select
                      id="beacon-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl bg-white/5 border border-border-hard px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#630ed4]/40"
                    >
                      {categoryOptions.map((c) => (
                        <option key={c} value={c} className="bg-surface-container">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-on-surface-variant block mb-1.5">Duration</span>
                    <div className="flex flex-wrap gap-2">
                      {DURATION_PRESETS.map((p) => (
                        <button
                          key={p.minutes}
                          type="button"
                          onClick={() => setDurationMinutes(p.minutes)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            durationMinutes === p.minutes
                              ? "border-[#630ed4]/50 bg-[#630ed4]/20 text-on-surface"
                              : "border-border-hard bg-white/5 text-on-surface-variant hover:border-white/20"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error ? (
                    <p className="text-sm text-red-700 dark:text-red-400/90" role="alert">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting || !venueId || demoLocked}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-on-surface bg-gradient-to-r from-[#630ed4] to-[#6520c0] disabled:opacity-40 disabled:cursor-not-allowed border border-border-hard shadow-lg shadow-[#630ed4]/20"
                  >
                    {submitting ? (
                      "Deploying…"
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Launch Pop-Up Hub
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            role="status"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-24 left-1/2 z-[220] -translate-x-1/2 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/90 text-emerald-100 text-sm shadow-lg"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { LANDING_IMG } from '@/lib/landingAssets';

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5 },
};

export default function NewFeaturesGrid() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="landing-new-features-grid"
      className="relative z-10 border-t border-zinc-900/80 px-6 py-16 md:px-12 md:py-24"
      aria-labelledby="landing-new-features-heading"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div {...fadeUp} className="mb-12 text-center md:mb-16">
          <h2
            id="landing-new-features-heading"
            className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl md:text-5xl"
          >
            What&apos;s <span className="text-[#630ed4]">shipping</span> now
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-on-surface-variant md:text-lg">
            New capabilities on Click—built for real rooms, real maps, and real follow-up.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {/* Local soundtrack map */}
          <motion.article
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-border-hard bg-white/[0.03] shadow-xl"
          >
            <div className="relative min-h-[320px] w-full flex-1 bg-background p-2 sm:min-h-[360px] lg:min-h-[400px]">
              <Image
                src={LANDING_IMG.mapMobileSoundtracks}
                alt="Click mobile map with local soundtracks and memory pins"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 520px"
                className="object-contain object-top"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 border-t border-border-hard p-5">
              <h3 className="text-lg font-semibold text-on-surface md:text-xl">
                Drop your beats. Find your tribe.
              </h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Explore a live, rolling 7-day soundtrack of your city. Drop songs from Spotify or Apple Music at the exact
                location you&apos;re standing. Discover pop-up jams, micro-bounties, flash mobs, and hidden node scavenger
                hunts right on your map.
              </p>
            </div>
          </motion.article>

          {/* Intent broadcast / radar metaphor */}
          <motion.article
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-border-hard bg-white/[0.03] shadow-xl"
          >
            <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden bg-background p-6 lg:min-h-[320px]">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(131,56,236,0.35) 0%, transparent 55%), radial-gradient(circle at 30% 40%, rgba(58,134,255,0.2) 0%, transparent 45%)',
                }}
              />
              <div
                className={`relative h-48 w-48 rounded-full border border-[#630ed4]/40 bg-[#630ed4]/5 shadow-[0_0_60px_-10px_rgba(131,56,236,0.7)] ${
                  reduceMotion ? '' : 'animate-pulse'
                }`}
              >
                <div className="absolute inset-4 rounded-full border border-dashed border-[#630ed4]/30" />
                <div className="absolute inset-[22%] rounded-full border border-[#630ed4]/25" />
                <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#630ed4] shadow-lg shadow-[#630ed4]/80" />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(255,255,255,0.03)_2px,rgba(255,255,255,0.03)_4px)] opacity-30 mix-blend-overlay" />
            </div>
            <div className="border-t border-border-hard p-5">
              <h3 className="text-lg font-semibold text-on-surface md:text-xl">
                Broadcast your intent. No ads attached.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Set your real-world availability intent (e.g., &apos;Looking for Coffee&apos; or &apos;Live Music&apos;).
                Venues see aggregated, anonymized heatmaps and can drop temporary &apos;Pop-Up Beacons&apos; with perks
                directly to you.
              </p>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}

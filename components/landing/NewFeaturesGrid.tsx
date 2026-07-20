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
          {/* Events on the map */}
          <motion.article
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-border-hard bg-white/[0.03] shadow-xl"
          >
            <div className="relative min-h-[320px] w-full flex-1 bg-background p-2 sm:min-h-[360px] lg:min-h-[400px]">
              <Image
                src={LANDING_IMG.mapMobileSoundtracks}
                alt="Click mobile map with Events bar and nearby pins"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 520px"
                className="object-contain object-top"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 border-t border-border-hard p-5">
              <h3 className="text-lg font-semibold text-on-surface md:text-xl">
                Events on the map. One tap away.
              </h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Browse what&apos;s happening nearby, open an event sheet for times and who&apos;s going, then RSVP or join
                the route. Your saved events also show up on Home so the next hangout isn&apos;t buried in a chat thread.
              </p>
            </div>
          </motion.article>

          {/* Event detail / RSVP */}
          <motion.article
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-border-hard bg-white/[0.03] shadow-xl"
          >
            <div className="relative min-h-[320px] w-full flex-1 bg-background p-2 sm:min-h-[360px] lg:min-h-[400px]">
              <Image
                src={LANDING_IMG.eventDetail}
                alt="Click mobile — Event detail with RSVP and Join Event Route"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 520px"
                className="object-contain object-top"
              />
            </div>
            <div className="border-t border-border-hard p-5">
              <h3 className="text-lg font-semibold text-on-surface md:text-xl">
                RSVP with the people you actually Clicked.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                See the host, start and end times, and which of your Clicks are already in—then Join Event Route when
                it&apos;s time to show up together. Availability intents are still there when you want a quick
                &quot;I&apos;m down for…&quot; signal; events are the new center of gravity for planning.
              </p>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}

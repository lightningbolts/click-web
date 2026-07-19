'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutDashboard, Smartphone } from 'lucide-react';
import { LANDING_IMG } from '@/lib/landingAssets';

const springHover = { type: 'spring' as const, stiffness: 320, damping: 22 };

export default function BentoScreenshotShowcase() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="landing-bento-screenshot-showcase"
      className="relative z-10 px-6 md:px-12 pt-8 pb-4 md:pb-8"
      aria-labelledby="landing-showcase-heading"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          id="landing-showcase-intro"
          initial={{ y: 24, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-10 text-center md:mb-14"
        >
          <h2
            id="landing-showcase-heading"
            className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl md:text-5xl"
          >
            See <span className="text-[#630ed4]">Click</span> in the wild
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-on-surface-variant sm:text-lg">
            Web and mobile in one shot—stacked the way you actually use them, right after the walkthrough above.
          </p>
        </motion.div>

        {/* 3D layered composition: web dashboard + overlapping mobile screens */}
        {/* Reserve vertical space for absolutely positioned phones + label */}
        <div
          id="landing-3d-device-stack"
          className="relative mx-auto overflow-visible pb-20 md:pb-28 lg:pb-32"
          style={{ perspective: reduceMotion ? undefined : '1400px' }}
        >
          <div
            className="relative mx-auto hidden h-[420px] w-full max-w-lg md:max-w-none md:block md:h-[420px] lg:h-[460px] [&>*]:will-change-transform"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <motion.div
              id="landing-3d-layer-web-dashboard"
              initial={false}
              animate={
                reduceMotion
                  ? { rotateX: 0, rotateY: 0, z: 0, scale: 1 }
                  : { rotateX: 10, rotateY: -14, z: -80, scale: 0.92 }
              }
              whileHover={
                reduceMotion
                  ? undefined
                  : { rotateX: 6, rotateY: -10, z: -60, scale: 0.94, transition: springHover }
              }
              transition={springHover}
              className="absolute left-1/2 top-6 hidden w-[min(100%,520px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border-hard bg-surface-container/40 shadow-[0_40px_120px_-20px_rgba(131,56,236,0.35)] md:block md:w-[min(92%,560px)]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="relative aspect-[1024/706] w-full">
                <Image
                  src={LANDING_IMG.memoryDashboard}
                  alt="Click web — Personal dashboard with stats, availability, and milestones"
                  fill
                  sizes="(max-width: 768px) 0px, 560px"
                  className="object-cover object-top"
                  priority
                  loading="eager"
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-border-hard bg-black/45 px-4 py-2.5">
                <LayoutDashboard className="h-4 w-4 text-[#630ed4]" aria-hidden />
                <span className="text-xs font-medium text-on-surface">Consumer · Click web</span>
              </div>
            </motion.div>

            <motion.div
              id="landing-3d-layer-phone-profile"
              initial={false}
              animate={
                reduceMotion
                  ? { y: 24, rotateX: 0, rotateY: 0, rotateZ: 0, z: 0, scale: 1 }
                  : {
                      y: 32,
                      rotateX: 4,
                      rotateY: 18,
                      rotateZ: -3,
                      z: 24,
                      scale: 0.88,
                    }
              }
              whileHover={
                reduceMotion
                  ? undefined
                  : {
                      y: 22,
                      rotateY: 12,
                      z: 48,
                      scale: 0.92,
                      transition: springHover,
                    }
              }
              transition={springHover}
              className="absolute left-[calc(50%-200px)] top-8 w-[200px] sm:left-[calc(50%-220px)] sm:w-[220px] md:left-[calc(50%-240px)] md:w-[240px]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="relative overflow-hidden rounded-[1.75rem] border border-border-hard bg-background shadow-[#630ed4]/25 ring-1 ring-white/10">
                <div className="relative aspect-[754/1024] w-full">
                  <Image
                    src={LANDING_IMG.profileMobile}
                    alt="Click mobile — Profile with moment, place, and interests"
                    fill
                    sizes="240px"
                    className="object-cover object-top"
                  />
                </div>
              </div>
            </motion.div>

            <motion.div
              id="landing-3d-layer-phone-home"
              initial={false}
              animate={
                reduceMotion
                  ? { y: 12, rotateX: 0, rotateY: 0, rotateZ: 0, z: 0, scale: 1 }
                  : {
                      y: 8,
                      rotateX: 6,
                      rotateY: -22,
                      rotateZ: 4,
                      z: 72,
                      scale: 0.95,
                    }
              }
              whileHover={
                reduceMotion
                  ? undefined
                  : {
                      y: -4,
                      rotateY: -14,
                      z: 96,
                      scale: 0.98,
                      transition: springHover,
                    }
              }
              transition={springHover}
              className="absolute left-[calc(50%+24px)] top-4 w-[168px] sm:left-[calc(50%+32px)] sm:w-[184px] md:left-[calc(50%+40px)] md:w-[200px]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-background p-[2px] shadow-[#630ed4]/30 ring-1 ring-[#630ed4]/20">
                <div className="relative aspect-[472/1024] w-full overflow-hidden rounded-[1.85rem]">
                  <Image
                    src={LANDING_IMG.homeMobile}
                    alt="Click mobile — Home with stay-in-touch cards and availability"
                    fill
                    sizes="200px"
                    className="object-cover object-top"
                    priority
                  />
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-hard bg-black/50 px-3 py-1 text-[10px] font-medium text-on-surface-variant md:text-xs">
                <Smartphone className="h-3.5 w-3.5 text-[#630ed4]" aria-hidden />
                Consumer app
              </div>
            </motion.div>
          </div>

          <div
            id="landing-3d-fallback-stack"
            className="mx-auto flex w-full max-w-md flex-col gap-6 md:hidden"
          >
            <div className="overflow-hidden rounded-2xl border border-border-hard bg-white/[0.03] shadow-xl">
              <div className="relative aspect-[1024/706] w-full">
                <Image
                  src={LANDING_IMG.memoryDashboard}
                  alt="Click web — Dashboard preview"
                  fill
                  sizes="(max-width: 768px) min(100vw, 448px), 448px"
                  className="object-cover object-top"
                  priority
                  loading="eager"
                />
              </div>
              <p className="border-t border-border-hard px-4 py-3 text-center text-xs text-on-surface-variant">
                Consumer · Click web
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="overflow-hidden rounded-2xl border border-border-hard shadow-lg">
                <div className="relative aspect-[754/1024] w-full">
                  <Image
                    src={LANDING_IMG.profileMobile}
                    alt="Profile on mobile"
                    fill
                    sizes="(max-width: 768px) 50vw, 224px"
                    className="object-contain object-top"
                  />
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border-hard shadow-lg">
                <div className="relative aspect-[472/1024] w-full">
                  <Image
                    src={LANDING_IMG.homeMobile}
                    alt="Home on mobile"
                    fill
                    sizes="(max-width: 768px) 50vw, 224px"
                    className="object-contain object-top"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="landing-bento-enterprise-cta"
          className="relative z-30 mx-auto mt-4 max-w-2xl rounded-2xl border border-white/5 bg-background/90 px-4 py-4 text-center shadow-lg shadow-black/40 md:mt-6 md:px-6"
        >
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="text-sm text-on-surface-variant"
          >
            Running a venue or campus program?{' '}
            <Link
              href="/enterprise"
              className="font-medium text-[#630ed4] underline-offset-4 hover:underline"
            >
              Explore Click for enterprise
            </Link>
            .
          </motion.p>
        </div>
      </div>
    </section>
  );
}

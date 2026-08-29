'use client';

import { motion } from 'framer-motion';
import ClickLogo from '@/components/ClickLogo';

export default function LoadingScreen() {
  return (
    <div
      className="flex min-h-[calc(100dvh-var(--navbar-height))] items-center justify-center overflow-hidden bg-background"
      data-testid="boot-loading-screen"
    >
      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div
          initial={false}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <ClickLogo size={72} className="h-[72px] w-[72px]" priority />
          <div className="text-5xl font-bold md:text-6xl">
            <span className="text-primary">C</span>
            <span className="text-on-surface">lick</span>
          </div>
        </motion.div>

        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-3 w-3 rounded-full bg-primary"
              animate={{
                scale: [1, 1.35, 1],
                opacity: [0.45, 1, 0.45],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        <motion.p
          initial={false}
          animate={{ opacity: 1 }}
          className="text-sm font-medium text-on-surface-variant"
        >
          Loading your connections...
        </motion.p>
      </div>
    </div>
  );
}

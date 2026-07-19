'use client';

import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-5xl font-bold md:text-6xl"
        >
          <span className="text-primary">C</span>
          <span className="text-on-surface">lick</span>
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-sm font-medium text-on-surface-variant"
        >
          Loading your connections...
        </motion.p>
      </div>
    </div>
  );
}

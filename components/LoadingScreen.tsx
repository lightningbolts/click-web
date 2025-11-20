'use client';

import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center overflow-hidden">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Click Logo with pulse animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-5xl md:text-6xl font-bold"
        >
          <span className="text-[#8338EC]">C</span>
          <span className="text-white">lick</span>
        </motion.div>

        {/* Animated dots */}
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 rounded-full bg-[#8338EC]"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Loading text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-zinc-400 text-sm"
        >
          Loading your connections...
        </motion.p>
      </div>
    </div>
  );
}


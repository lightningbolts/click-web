'use client';

import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Zap, RefreshCw, Download, Settings } from 'lucide-react';

interface InsightShellProps {
  children: ReactNode;
  venueName?: string;
  lastUpdated?: Date;
  onRefresh?: () => void;
  isLive?: boolean;
}

/**
 * InsightShell - Main layout wrapper for the Click Insights Dashboard
 * Provides the "Glass Cockpit" aesthetic with bento box grid layout
 */
export default function InsightShell({
  children,
  venueName = 'The Neon Lounge',
  lastUpdated,
  onRefresh,
  isLive = true,
}: InsightShellProps) {
  const formatLastUpdated = (date?: Date) => {
    if (!date) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      {/* Ambient background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC]/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF]/10 rounded-full blur-[128px]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 p-4 md:p-6 lg:p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 md:mb-8"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Title Section */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <motion.div
                    animate={{ 
                      boxShadow: isLive 
                        ? ['0 0 20px rgba(131, 56, 236, 0.5)', '0 0 40px rgba(131, 56, 236, 0.8)', '0 0 20px rgba(131, 56, 236, 0.5)']
                        : '0 0 0px rgba(131, 56, 236, 0)'
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="p-3 bg-[#8338EC]/20 rounded-xl border border-[#8338EC]/30"
                  >
                    <Zap className="w-6 h-6 text-[#8338EC]" />
                  </motion.div>
                  {isLive && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                      Click Insights
                    </span>
                  </h1>
                  <p className="text-zinc-500 text-sm md:text-base">
                    {venueName} • {isLive ? 'Live' : 'Offline'} Dashboard
                  </p>
                </div>
              </div>

              {/* Controls Section */}
              <div className="flex items-center gap-3">
                {/* Last Updated Badge */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                  <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
                  <span className="text-xs text-zinc-400">
                    Updated {formatLastUpdated(lastUpdated)}
                  </span>
                </div>

                {/* Action Buttons */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onRefresh}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Refresh data"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Export data"
                >
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Settings"
                >
                  <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>
              </div>
            </div>
          </motion.header>

          {/* Bento Grid Container */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {children}
          </motion.main>

          {/* Footer */}
          <footer className="mt-8 text-center">
            <p className="text-xs text-zinc-600">
              Data is anonymized and aggregated to protect user privacy
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * GlassPanel - Reusable glassmorphism panel component
 */
interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'purple' | 'blue' | 'green' | 'none';
}

export function GlassPanel({ 
  children, 
  className = '', 
  hover = true,
  glow = 'none' 
}: GlassPanelProps) {
  const glowColors = {
    purple: 'hover:shadow-[0_0_30px_-5px_rgba(131,56,236,0.3)]',
    blue: 'hover:shadow-[0_0_30px_-5px_rgba(58,134,255,0.3)]',
    green: 'hover:shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]',
    none: '',
  };

  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`
        bg-white/5 backdrop-blur-md 
        border border-white/10 
        rounded-2xl 
        transition-all duration-300
        ${hover ? 'hover:bg-white/[0.07] hover:border-white/20' : ''}
        ${glowColors[glow]}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}

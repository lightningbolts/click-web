'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Users, Link2, Sparkles } from 'lucide-react';
import { GlassPanel } from './InsightsDashboard';
import type { StickyScore, ConnectionDensity, LiveCount } from '@/lib/insights/mockData';

// ============================================
// STICKY SCORE GAUGE COMPONENT
// ============================================

interface StickyScoreCardProps {
  data: StickyScore;
}

export function StickyScoreCard({ data }: StickyScoreCardProps) {
  const { score, trend, change, breakdown } = data;
  
  // Calculate gauge arc
  const radius = 80;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  // Score color based on value
  const getScoreColor = (s: number) => {
    if (s >= 80) return '#22c55e'; // green
    if (s >= 60) return '#8338EC'; // purple
    if (s >= 40) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };
  
  const scoreColor = getScoreColor(score);
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-zinc-500';

  return (
    <GlassPanel className="p-6" glow="purple">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#8338EC]/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-[#8338EC]" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Social Sticky Score</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change}%</span>
        </div>
      </div>
      
      {/* Circular Gauge */}
      <div className="flex justify-center my-4">
        <div className="relative">
          <svg width={radius * 2} height={radius * 2} className="transform -rotate-90">
            {/* Background arc */}
            <circle
              stroke="rgba(255,255,255,0.1)"
              fill="transparent"
              strokeWidth={strokeWidth}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            {/* Progress arc */}
            <motion.circle
              stroke={scoreColor}
              fill="transparent"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              style={{
                strokeDasharray: `${circumference} ${circumference}`,
                filter: `drop-shadow(0 0 8px ${scoreColor}50)`,
              }}
            />
          </svg>
          {/* Score display */}
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-4xl font-bold"
              style={{ color: scoreColor }}
            >
              {score}
            </motion.span>
            <span className="text-xs text-zinc-500">/ 100</span>
          </div>
        </div>
      </div>
      
      {/* Breakdown stats */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/10">
        <div className="text-center">
          <p className="text-lg font-semibold text-white">{breakdown.repeatVisitors}%</p>
          <p className="text-[10px] text-zinc-500">Repeat</p>
        </div>
        <div className="text-center border-x border-white/10">
          <p className="text-lg font-semibold text-white">{breakdown.avgConnectionsPerVisit}</p>
          <p className="text-[10px] text-zinc-500">Avg/Visit</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-white">{breakdown.communityEngagement}%</p>
          <p className="text-[10px] text-zinc-500">Engaged</p>
        </div>
      </div>
    </GlassPanel>
  );
}

// ============================================
// CONNECTION DENSITY CARD
// ============================================

interface ConnectionDensityCardProps {
  data: ConnectionDensity;
}

export function ConnectionDensityCard({ data }: ConnectionDensityCardProps) {
  const { value, totalArea, activeZones, trend } = data;
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-zinc-500';
  
  // Visual density indicator
  const densityLevel = Math.min(Math.floor(value / 2), 10);
  
  return (
    <GlassPanel className="p-6" glow="blue">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#3A86FF]/20 rounded-lg">
            <Link2 className="w-4 h-4 text-[#3A86FF]" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Connection Density</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
        </div>
      </div>
      
      <div className="flex items-baseline gap-2 mb-2">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-4xl font-bold text-white"
        >
          {value}
        </motion.span>
        <span className="text-sm text-zinc-500">per 100 sq ft</span>
      </div>
      
      {/* Density bar visualization */}
      <div className="flex gap-1 my-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className={`flex-1 h-8 rounded-sm origin-bottom ${
              i < densityLevel 
                ? 'bg-gradient-to-t from-[#3A86FF] to-[#3A86FF]/50' 
                : 'bg-white/10'
            }`}
            style={{
              boxShadow: i < densityLevel ? '0 0 10px rgba(58, 134, 255, 0.3)' : 'none',
            }}
          />
        ))}
      </div>
      
      <div className="flex justify-between text-xs text-zinc-500 mt-4 pt-4 border-t border-white/10">
        <span>Total Area: {totalArea.toLocaleString()} sq ft</span>
        <span>{activeZones} active zones</span>
      </div>
    </GlassPanel>
  );
}

// ============================================
// LIVE COUNT CARD
// ============================================

interface LiveCountCardProps {
  data: LiveCount;
}

export function LiveCountCard({ data }: LiveCountCardProps) {
  const { current, peak, peakTime, capacity, trend } = data;
  const fillPercentage = (current / capacity) * 100;
  
  // Color based on capacity
  const getCapacityColor = (pct: number) => {
    if (pct >= 90) return '#ef4444'; // red - near capacity
    if (pct >= 70) return '#f59e0b'; // amber - getting busy
    if (pct >= 40) return '#22c55e'; // green - good
    return '#3A86FF'; // blue - light
  };
  
  const capacityColor = getCapacityColor(fillPercentage);

  return (
    <GlassPanel className="p-6" glow="green">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Users className="w-4 h-4 text-green-500" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Live Count</span>
        </div>
        <div className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </div>
      </div>
      
      <div className="flex items-baseline gap-2 mb-2">
        <motion.span
          key={current}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold"
          style={{ color: capacityColor }}
        >
          {current}
        </motion.span>
        <span className="text-sm text-zinc-500">/ {capacity}</span>
      </div>
      
      {/* Capacity bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPercentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ 
            backgroundColor: capacityColor,
            boxShadow: `0 0 10px ${capacityColor}50`,
          }}
        />
      </div>
      
      {/* Mini sparkline */}
      <div className="flex items-end gap-0.5 h-12 mb-4">
        {trend.map((value, i) => {
          const height = (value / capacity) * 100;
          return (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="flex-1 rounded-t-sm origin-bottom"
              style={{
                height: `${height}%`,
                backgroundColor: i === trend.length - 1 ? capacityColor : 'rgba(255,255,255,0.2)',
              }}
            />
          );
        })}
      </div>
      
      <div className="flex justify-between text-xs text-zinc-500 pt-4 border-t border-white/10">
        <span>Peak: {peak}</span>
        <span>@ {peakTime}</span>
      </div>
    </GlassPanel>
  );
}

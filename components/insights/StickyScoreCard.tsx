'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Users, Link2, Sparkles } from 'lucide-react';
import { GlassPanel } from './GlassPanel';
import { InsightCallout } from './InsightCallout';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';
import type { StickyScore, ConnectionDensity, LiveCount } from '@/lib/insights/mockData';

// ============================================
// STICKY SCORE GAUGE COMPONENT
// ============================================

interface StickyScoreCardProps {
  data: StickyScore;
}

export function StickyScoreCard({ data }: StickyScoreCardProps) {
  const { score, trend, change, breakdown } = data;
  const chart = useInsightsChartTheme();
  
  // Calculate gauge arc
  const radius = 80;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  // Score color based on value
  const getScoreColor = (s: number) => {
    if (s >= 80) return chart.primary;
    if (s >= 60) return chart.primary;
    if (s >= 40) return chart.axis;
    return 'var(--color-error)';
  };
  
  const scoreColor = getScoreColor(score);
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-primary' : trend === 'down' ? 'text-error' : 'text-on-surface-variant';

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-on-surface-variant">Social Sticky Score</span>
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
              stroke={chart.ring}
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
            <span className="text-xs text-on-surface-variant">/ 100</span>
          </div>
        </div>
      </div>
      
      {/* Breakdown stats */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border-hard">
        <div className="text-center">
          <p className="text-lg font-semibold text-on-surface">{breakdown.repeatVisitors}%</p>
          <p className="text-[10px] text-on-surface-variant">Repeat</p>
        </div>
        <div className="text-center border-x border-border-hard">
          <p className="text-lg font-semibold text-on-surface">{breakdown.avgConnectionsPerVisit}</p>
          <p className="text-[10px] text-on-surface-variant">Avg/Visit</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-on-surface">{breakdown.communityEngagement}%</p>
          <p className="text-[10px] text-on-surface-variant">Engaged</p>
        </div>
      </div>
      {score > 0 ? (
        <InsightCallout value={score} metricKey="sticky_score" />
      ) : null}
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
  const trendColor = trend === 'up' ? 'text-primary' : trend === 'down' ? 'text-error' : 'text-on-surface-variant';
  
  // Visual density indicator
  const densityLevel = Math.min(Math.floor(value / 2), 10);
  
  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Link2 className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-on-surface-variant">Connection Density</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
        </div>
      </div>
      
      <div className="flex items-baseline gap-2 mb-2">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-4xl font-bold text-on-surface"
        >
          {value}
        </motion.span>
        <span className="text-sm text-on-surface-variant">per 100 sq ft</span>
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
                ? 'bg-primary' 
                : 'bg-surface-container-high'
            }`}
            style={{
              boxShadow: "none",
            }}
          />
        ))}
      </div>
      
      <div className="flex justify-between text-xs text-on-surface-variant mt-4 pt-4 border-t border-border-hard">
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
  const chart = useInsightsChartTheme();
  const fillPercentage = (current / capacity) * 100;
  
  // Color based on capacity
  const getCapacityColor = (pct: number) => {
    if (pct >= 90) return 'var(--color-error)';
    if (pct >= 70) return chart.axis;
    if (pct >= 40) return chart.primary;
    return chart.primary;
  };
  
  const capacityColor = getCapacityColor(fillPercentage);

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-on-surface-variant">Live Count</span>
        </div>
        <div className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
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
        <span className="text-sm text-on-surface-variant">/ {capacity}</span>
      </div>
      
      {/* Capacity bar */}
      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPercentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ 
            backgroundColor: capacityColor,
            
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
                backgroundColor: i === trend.length - 1 ? capacityColor : chart.barMuted,
              }}
            />
          );
        })}
      </div>
      
      <div className="flex justify-between text-xs text-on-surface-variant pt-4 border-t border-border-hard">
        <span>Peak: {peak}</span>
        <span>@ {peakTime}</span>
      </div>
    </GlassPanel>
  );
}

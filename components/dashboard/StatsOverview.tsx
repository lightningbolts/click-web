'use client';

import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  Flame,
  Heart,
  Award,
  Zap,
  Target,
  Check,
  Lock,
} from 'lucide-react';

interface StatTrend {
  /** Signed percent change; null hides the badge */
  percent: number | null;
}

interface StatItem {
  label: string;
  value: string | number;
  trend?: StatTrend;
  icon: any;
  color: string;
  bgColor: string;
}

interface StatsOverviewProps {
  totalConnections: number;
  thisMonth: number;
  streak: number;
  retentionRate: number;
  /** This month's adds vs network size at month start (null = hide) */
  totalNetworkGrowthPercent?: number | null;
  /** Vs last calendar month's connection count (null = hide) */
  thisMonthTrendPercent?: number | null;
  topLocation?: string;
}

/**
 * StatsOverview - Key metrics cards for the Digital Memory Box
 * Displays connection stats with visual indicators
 */
export default function StatsOverview({
  totalConnections,
  thisMonth,
  streak,
  retentionRate,
  totalNetworkGrowthPercent = null,
  thisMonthTrendPercent = null,
  topLocation = 'UW Campus',
}: StatsOverviewProps) {
  const stats: StatItem[] = [
    {
      label: 'Total Connections',
      value: totalConnections,
      trend:
        totalNetworkGrowthPercent !== null
          ? { percent: totalNetworkGrowthPercent }
          : undefined,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/20',
    },
    {
      label: 'This Month',
      value: thisMonth,
      trend:
        thisMonthTrendPercent !== null ? { percent: thisMonthTrendPercent } : undefined,
      icon: Calendar,
      color: 'text-primary',
      bgColor: 'bg-primary/20',
    },
    {
      label: 'Connection Streak',
      value: `${streak} days`,
      icon: Flame,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/20',
    },
    {
      label: 'Retention Rate',
      value: `${retentionRate}%`,
      icon: Heart,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/20',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            variants={itemVariants}
            className="fc-card p-4 rounded-2xl border border-border-hard hover:border-border-hard transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 ${stat.bgColor} rounded-xl`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {stat.trend && stat.trend.percent !== null && (
                <div
                  className={`flex items-center gap-1 text-xs ${
                    stat.trend.percent >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                  }`}
                  title={
                    stat.label === 'Total Connections'
                      ? 'New connections this month as a share of your network at the start of the month'
                      : 'Change vs number of connections made last calendar month'
                  }
                >
                  {stat.trend.percent >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {stat.trend.percent >= 0 ? '+' : ''}
                  {stat.trend.percent}%
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
              {stat.value}
            </div>
            <div className="text-xs text-on-surface-variant">{stat.label}</div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/**
 * AchievementBadge - Small achievement display
 */
export function AchievementBadge({
  title,
  description,
  icon: Icon = Award,
  isNew = false,
  unlocked = true,
}: {
  title: string;
  description: string;
  icon?: any;
  isNew?: boolean;
  unlocked?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center gap-3 p-3 fc-card rounded-xl border relative overflow-hidden group ${
        unlocked
          ? 'border-border-hard'
          : 'border-dashed border-border-hard bg-surface-container/40 opacity-80'
      }`}
      aria-label={unlocked ? `${title} earned` : `${title} locked`}
    >
      <div
        className={`p-2 rounded-lg ${
          unlocked
            ? 'bg-gradient-to-br from-[#FFD93D]/20 to-[#FF6B6B]/20'
            : 'border border-border-hard bg-surface-container'
        }`}
      >
        <Icon className={`w-5 h-5 ${unlocked ? 'text-[#FFD93D]' : 'text-outline'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`font-semibold text-sm truncate ${
            unlocked ? 'text-on-surface' : 'text-on-surface-variant'
          }`}
        >
          {title}
        </div>
        <div className="text-xs text-on-surface-variant truncate">{description}</div>
      </div>
      {unlocked ? (
        <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
      ) : (
        <Lock className="h-4 w-4 shrink-0 text-outline" aria-hidden />
      )}
      {isNew && unlocked && (
        <span className="absolute top-2 right-8 px-1.5 py-0.5 bg-primary text-[10px] font-bold rounded-full text-on-primary">
          NEW
        </span>
      )}
      {unlocked ? (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
      ) : null}
    </motion.div>
  );
}

/**
 * MilestoneProgress - Progress toward next milestone
 */
export function MilestoneProgress({
  current,
  target,
  label,
  reward,
}: {
  current: number;
  target: number;
  label: string;
  reward: string;
}) {
  const progress = Math.min((current / target) * 100, 100);
  
  return (
    <div className="p-4 fc-card rounded-xl border border-border-hard">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-on-surface">{label}</span>
        </div>
        <span className="text-xs text-on-surface-variant">{current}/{target}</span>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full bg-primary rounded-full"
        />
      </div>
      
      {/* Reward hint */}
      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
        <Zap className="w-3 h-3 text-[#FFD93D]" />
        <span>Reward: {reward}</span>
      </div>
    </div>
  );
}

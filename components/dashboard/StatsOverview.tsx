'use client';

import { motion } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  Calendar, 
  Flame, 
  Heart,
  Award,
  Zap,
  Target
} from 'lucide-react';

interface StatItem {
  label: string;
  value: string | number;
  change?: number;
  icon: any;
  color: string;
  bgColor: string;
}

interface StatsOverviewProps {
  totalConnections: number;
  thisMonth: number;
  streak: number;
  retentionRate: number;
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
  topLocation = 'UW Campus',
}: StatsOverviewProps) {
  const stats: StatItem[] = [
    {
      label: 'Total Connections',
      value: totalConnections,
      change: 12,
      icon: Users,
      color: 'text-[#8338EC]',
      bgColor: 'bg-[#8338EC]/20',
    },
    {
      label: 'This Month',
      value: thisMonth,
      change: 25,
      icon: Calendar,
      color: 'text-[#3A86FF]',
      bgColor: 'bg-[#3A86FF]/20',
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
      change: 5,
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
            className="glass p-4 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 ${stat.bgColor} rounded-xl`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {stat.change && (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <TrendingUp className="w-3 h-3" />
                  +{stat.change}%
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-white mb-1 group-hover:text-[#8338EC] transition-colors">
              {stat.value}
            </div>
            <div className="text-xs text-zinc-500">{stat.label}</div>
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
  isNew = false 
}: { 
  title: string; 
  description: string; 
  icon?: any;
  isNew?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 p-3 glass rounded-xl border border-zinc-800 relative overflow-hidden group"
    >
      <div className="p-2 bg-gradient-to-br from-[#FFD93D]/20 to-[#FF6B6B]/20 rounded-lg">
        <Icon className="w-5 h-5 text-[#FFD93D]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white text-sm truncate">{title}</div>
        <div className="text-xs text-zinc-500 truncate">{description}</div>
      </div>
      {isNew && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#8338EC] text-[10px] font-bold rounded-full">
          NEW
        </span>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
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
    <div className="p-4 glass rounded-xl border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#8338EC]" />
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
        <span className="text-xs text-zinc-500">{current}/{target}</span>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-[#8338EC] to-[#3A86FF] rounded-full"
        />
      </div>
      
      {/* Reward hint */}
      <div className="flex items-center gap-1 text-xs text-zinc-500">
        <Zap className="w-3 h-3 text-[#FFD93D]" />
        <span>Reward: {reward}</span>
      </div>
    </div>
  );
}

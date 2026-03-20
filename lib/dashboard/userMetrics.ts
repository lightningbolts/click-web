import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { LucideIcon } from 'lucide-react';
import { Award, Flame, Heart, Network, Sparkles, Star, Users } from 'lucide-react';

/** Local calendar day key for streak / grouping */
function dateKey(d: Date): string {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/**
 * Longest run of consecutive calendar days with at least one connection,
 * ending on the user's most recent connection day (not necessarily today).
 */
export function computeConnectionStreak(connections: ConnectionRecord[]): number {
  if (connections.length === 0) return 0;
  const days = new Set<string>();
  for (const c of connections) {
    days.add(dateKey(c.dateMet));
  }
  let cursor = new Date(
    Math.max(...connections.map((c) => c.dateMet.getTime()))
  );
  cursor.setHours(12, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    if (days.has(dateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function countConnectionsThisMonth(connections: ConnectionRecord[]): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return connections.filter((c) => c.dateMet >= start).length;
}

export interface UserDashboardMetrics {
  totalConnections: number;
  thisMonth: number;
  streak: number;
  retentionRate: number;
  keptCount: number;
}

export function buildDashboardMetrics(connections: ConnectionRecord[]): UserDashboardMetrics {
  const totalConnections = connections.length;
  const thisMonth = countConnectionsThisMonth(connections);
  const streak = computeConnectionStreak(connections);
  const keptCount = connections.filter((c) => c.status === 'kept').length;
  const retentionRate =
    totalConnections > 0 ? Math.round((keptCount / totalConnections) * 100) : 0;
  return { totalConnections, thisMonth, streak, retentionRate, keptCount };
}

export interface UnlockedAchievement {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Higher = listed first in "Recent" */
  priority: number;
}

type UnlockFn = (m: UserDashboardMetrics) => boolean;

const ACHIEVEMENT_RULES: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  priority: number;
  unlocked: UnlockFn;
}[] = [
  {
    id: 'first_connection',
    title: 'First Connection',
    description: 'Met someone on Click',
    icon: Sparkles,
    priority: 10,
    unlocked: (m) => m.totalConnections >= 1,
  },
  {
    id: 'social_butterfly',
    title: 'Social Butterfly',
    description: 'Met 10+ people this month',
    icon: Users,
    priority: 60,
    unlocked: (m) => m.thisMonth >= 10,
  },
  {
    id: 'week_warrior',
    title: 'Week Warrior',
    description: '7-day connection streak',
    icon: Flame,
    priority: 55,
    unlocked: (m) => m.streak >= 7,
  },
  {
    id: 'connector',
    title: 'Connector',
    description: '25+ people in your network',
    icon: Star,
    priority: 40,
    unlocked: (m) => m.totalConnections >= 25,
  },
  {
    id: 'networker',
    title: 'Networker',
    description: '50+ lifetime connections',
    icon: Network,
    priority: 70,
    unlocked: (m) => m.totalConnections >= 50,
  },
  {
    id: 'century_club',
    title: 'Century Club',
    description: '100+ lifetime connections',
    icon: Award,
    priority: 90,
    unlocked: (m) => m.totalConnections >= 100,
  },
  {
    id: 'keeper',
    title: 'Keeper',
    description: '80%+ retention with 5+ connections',
    icon: Heart,
    priority: 45,
    unlocked: (m) =>
      m.totalConnections >= 5 && m.retentionRate >= 80,
  },
];

export function getUnlockedAchievements(metrics: UserDashboardMetrics): UnlockedAchievement[] {
  return ACHIEVEMENT_RULES.filter((r) => r.unlocked(metrics))
    .map(({ id, title, description, icon, priority }) => ({
      id,
      title,
      description,
      icon,
      priority,
    }))
    .sort((a, b) => b.priority - a.priority);
}

export interface NextMilestone {
  target: number;
  label: string;
  reward: string;
}

const MILESTONE_TIERS: { target: number; label: string; reward: string }[] = [
  { target: 5, label: 'First Circle', reward: 'Bronze badge unlock' },
  { target: 10, label: 'Double Digits', reward: 'Silver badge unlock' },
  { target: 25, label: 'Connection Collector', reward: 'Gold badge unlock' },
  { target: 50, label: 'Network Hub', reward: 'Special badge unlock' },
  { target: 100, label: 'Century Club', reward: 'Platinum badge unlock' },
  { target: 250, label: 'Community Anchor', reward: 'Elite badge unlock' },
];

export function getNextMilestone(current: number): NextMilestone {
  for (const tier of MILESTONE_TIERS) {
    if (current < tier.target) {
      return { target: tier.target, label: tier.label, reward: tier.reward };
    }
  }
  const step = 100;
  const next = Math.ceil((current + 1) / step) * step;
  return {
    target: next,
    label: 'Keep Growing',
    reward: 'Exclusive badge unlock',
  };
}

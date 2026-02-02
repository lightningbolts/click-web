/**
 * Click Insights Dashboard Components
 * 
 * This module exports all components for the B2B venue analytics dashboard.
 * 
 * Usage:
 * import { InsightsDashboard, StickyScoreCard, HeatmapView } from '@/components/insights';
 */

// Main Dashboard (Shell + Content) + GlassPanel
export { default as InsightsDashboard, GlassPanel } from './InsightsDashboard';

// Metric Cards
export { StickyScoreCard, ConnectionDensityCard, LiveCountCard } from './StickyScoreCard';

// Visualizations
export { default as HeatmapView } from './HeatmapView';
export { default as TribeChart } from './TribeChart';

// Live Feed
export { default as VibeStream } from './VibeStream';

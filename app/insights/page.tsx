'use client';

import { useState, useCallback } from 'react';
import InsightsDashboard from '@/components/insights/InsightsDashboard';

/**
 * InsightsPage - Business analytics dashboard for venue partners
 * Uses InsightsDashboard as a consolidated shell + content component
 */
export default function InsightsPage() {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setLastUpdated(new Date());
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleLastUpdatedChange = useCallback((date: Date) => {
    setLastUpdated(date);
  }, []);

  return (
    <InsightsDashboard
      venueName="The Neon Lounge"
      lastUpdated={lastUpdated}
      onRefresh={handleRefresh}
      isLive={true}
      refreshKey={refreshTrigger}
      onLastUpdatedChange={handleLastUpdatedChange}
    />
  );
}
'use client';

import { useState, useCallback } from 'react';
import InsightShell from '@/components/insights/InsightShell';
import InsightsDashboard from '@/components/insights/InsightsDashboard';

/**
 * InsightsPage - Business analytics dashboard for venue partners
 * Uses InsightShell as the layout wrapper and InsightsDashboard for content
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
    <InsightShell
      venueName="The Neon Lounge"
      lastUpdated={lastUpdated}
      onRefresh={handleRefresh}
      isLive={true}
    >
      <InsightsDashboard 
        key={refreshTrigger}
        onLastUpdatedChange={handleLastUpdatedChange}
      />
    </InsightShell>
  );
}
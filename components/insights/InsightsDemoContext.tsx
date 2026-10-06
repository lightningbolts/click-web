"use client";

import { createContext, useContext, type ReactNode } from "react";

type InsightsDemoContextValue = { demoMode: boolean };

const InsightsDemoContext = createContext<InsightsDemoContextValue>({ demoMode: false });

/**
 * Demo data for sales (spec §9.5): on only while the URL carries `?demo=1`, and never offered as
 * a toggle. The Insights page shows a persistent "Demo data" notice whenever it's on.
 */
export function InsightsDemoProvider({ demoMode, children }: { demoMode: boolean; children: ReactNode }) {
  return <InsightsDemoContext.Provider value={{ demoMode }}>{children}</InsightsDemoContext.Provider>;
}

export function useInsightsDemo(): InsightsDemoContextValue {
  return useContext(InsightsDemoContext);
}

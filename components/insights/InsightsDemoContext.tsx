"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "click_insights_demo_mode";

function readStoredDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

type InsightsDemoContextValue = {
  demoMode: boolean;
  setDemoMode: (value: boolean) => void;
};

const InsightsDemoContext = createContext<InsightsDemoContextValue | null>(null);

export function InsightsDemoProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [demoMode, setDemoModeState] = useState(false);

  useLayoutEffect(() => {
    const q = searchParams.get("demo");
    if (q === "1") {
      setDemoModeState(true);
      try {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        /* ignore */
      }
      return;
    }
    if (q === "0") {
      setDemoModeState(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, "false");
      } catch {
        /* ignore */
      }
      return;
    }
    setDemoModeState(readStoredDemo());
  }, [searchParams]);

  const setDemoMode = useCallback((value: boolean) => {
    setDemoModeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ demoMode, setDemoMode }),
    [demoMode, setDemoMode],
  );

  return (
    <InsightsDemoContext.Provider value={value}>
      {children}
    </InsightsDemoContext.Provider>
  );
}

export function useInsightsDemo(): InsightsDemoContextValue {
  const ctx = useContext(InsightsDemoContext);
  if (!ctx) {
    throw new Error("useInsightsDemo must be used within InsightsDemoProvider");
  }
  return ctx;
}

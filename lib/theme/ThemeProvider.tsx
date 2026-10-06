"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DARK_QUERY, STORAGE_KEY, THEME_COLOR, type Theme } from "./themeBoot";

export { THEME_BOOT_SCRIPT, THEME_COLOR, type Theme } from "./themeBoot";

/** What the person chose in Settings › Appearance. System is the default (spec §4). */
export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  /** Resolved theme (light/dark) — what maps and charts should render. */
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Pins the opposite of the current resolved theme. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/** @deprecated use readStoredPreference + resolveTheme */
export function resolveInitialTheme(): Theme {
  return resolveTheme(readStoredPreference());
}

export function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

const CHANGE_EVENT = "click-theme-change";

function persist(preference: ThemePreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Stored preference as an external store: same-tab changes + other tabs (storage event). */
function subscribePreference(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function subscribeSystem(onChange: () => void) {
  const mql = window.matchMedia?.(DARK_QUERY);
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

const serverPreference = (): ThemePreference => "system";
const serverSystemTheme = (): Theme => "light";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribePreference, readStoredPreference, serverPreference);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, serverSystemTheme);
  const theme: Theme = preference === "system" ? system : preference;

  // The boot script already painted the right class; this keeps it in sync after changes.
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => persist(next), []);

  const toggleTheme = useCallback(() => {
    persist(resolveTheme(readStoredPreference()) === "dark" ? "light" : "dark");
  }, []);

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

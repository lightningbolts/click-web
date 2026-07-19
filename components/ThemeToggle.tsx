"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { cn } from "@/lib/cn";

export default function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border-2 border-border-hard bg-surface px-2.5 py-2 text-on-surface hover:bg-surface-container-low active:translate-x-0.5 active:translate-y-0.5",
        className,
      )}
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-primary" />
      ) : (
        <Moon className="h-4 w-4 text-primary" />
      )}
      {showLabel ? (
        <span className="text-sm font-semibold">{isDark ? "Light" : "Dark"}</span>
      ) : null}
    </button>
  );
}

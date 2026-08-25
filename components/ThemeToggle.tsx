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
        "inline-flex items-center justify-center rounded-[8px] border border-border-hard bg-surface text-on-surface hover:bg-surface-container-low active:translate-x-0.5 active:translate-y-0.5",
        showLabel ? "h-9 gap-2 px-3" : "h-9 w-9 p-0",
        className,
      )}
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {isDark ? (
        <Sun className="block size-4 text-primary" />
      ) : (
        <Moon className="block size-4 text-primary" />
      )}
      {showLabel ? (
        <span className="text-sm font-semibold">{isDark ? "Light" : "Dark"}</span>
      ) : null}
    </button>
  );
}
